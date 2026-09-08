import "@stdlib/deploy";
import "@stdlib/ownable";
import "@stdlib/stoppable";

// ============================================
// MESSAGES
// ============================================

message BuyTokens {
    minTokensOut: Int as coins;
}

message SellTokens {
    tokenAmount: Int as coins;
    minTonOut: Int as coins;
}

message SetJettonMaster {
    jettonMaster: Address;
}

message Mint {
    to: Address;
    amount: Int as coins;
}

message Burn {
    from: Address;
    amount: Int as coins;
}

// ============================================
// EVENTS (stored in transaction logs)
// ============================================

message(0x12345678) TokenPurchase {
    buyer: Address;
    tonAmount: Int as coins;
    tokenAmount: Int as coins;
}

message(0x12345679) TokenSale {
    seller: Address;
    tokenAmount: Int as coins;
    tonAmount: Int as coins;
}

message(0x1234567a) Graduated {
    token: Address;
    tonReserve: Int as coins;
    tokenReserve: Int as coins;
}

// ============================================
// STATE STRUCT
// ============================================

struct CurveState {
    totalSupply: Int as coins;
    tonReserve: Int as coins;
    tokenReserve: Int as coins;
    graduated: Bool;
    creator: Address;
    price: Int;
    platformFeeBps: Int;
    creatorFeeBps: Int;
}

// ============================================
// CONTRACT
// ============================================

contract BondingCurve with Deployable, Ownable, Stoppable {
    
    // Config constants
    const PLATFORM_FEE_BPS: Int = 100;      // 1% = 100 basis points
    const CREATOR_FEE_BPS: Int = 100;       // 1% to creator
    const GRADUATION_THRESHOLD: Int = ton("500"); // 500 TON ~ $69k
    const MIN_BUY: Int = ton("0.01");       // 0.01 TON minimum
    const INITIAL_PRICE: Int = 1000000;     // 1 TON = 1,000,000 tokens initially
    
    // Storage
    totalSupply: Int as coins = 0;
    tonReserve: Int as coins = 0;
    tokenReserve: Int as coins = 0;
    graduated: Bool = false;
    jettonMaster: Address? = null;
    creator: Address;
    platformWallet: Address;
    
    init(creator: Address, platformWallet: Address) {
        self.creator = creator;
        self.platformWallet = platformWallet;
    }
    
    // ============================================
    // ADMIN
    // ============================================
    
    receive(msg: SetJettonMaster) {
        self.requireOwner();
        require(self.jettonMaster == null, "Already set");
        self.jettonMaster = msg.jettonMaster;
    }
    
    // ============================================
    // BUY TOKENS
    // ============================================
    
    receive(msg: BuyTokens) {
        require(!self.graduated, "Already graduated to DEX");
        require(self.jettonMaster != null, "Jetton master not configured");
        
        let ctx: Context = context();
        let tonIn: Int = ctx.value;
        require(tonIn >= self.MIN_BUY, "Below minimum buy amount");
        
        // Calculate fees
        let platformFee: Int = tonIn * self.PLATFORM_FEE_BPS / 10000;
        let creatorFee: Int = tonIn * self.CREATOR_FEE_BPS / 10000;
        let tonForCurve: Int = tonIn - platformFee - creatorFee;
        
        // Require enough gas left for execution
        require(tonForCurve > 0, "Insufficient TON after fees");
        
        // Calculate tokens out using bonding curve
        let tokensOut: Int = self.calculateBuy(tonForCurve);
        require(tokensOut >= msg.minTokensOut, "Slippage exceeded");
        require(tokensOut > 0, "Zero tokens out");
        
        // Update reserves BEFORE external calls (reentrancy protection)
        self.tonReserve += tonForCurve;
        self.totalSupply += tokensOut;
        self.tokenReserve += tokensOut;
        
        // Send platform fee
        if (platformFee > 0) {
            send(SendParameters{
                to: self.platformWallet,
                value: platformFee,
                mode: SendPayGasSeparately,
                bounce: false,
                body: emptyCell()
            });
        }
        
        // Send creator fee
        if (creatorFee > 0) {
            send(SendParameters{
                to: self.creator,
                value: creatorFee,
                mode: SendPayGasSeparately,
                bounce: false,
                body: emptyCell()
            });
        }
        
        // Mint tokens to buyer
        self.mint(ctx.sender, tokensOut);
        
        // Emit purchase event
        emit(TokenPurchase{
            buyer: ctx.sender,
            tonAmount: tonForCurve,
            tokenAmount: tokensOut
        }.toCell());
        
        // Check graduation condition
        if (self.tonReserve >= self.GRADUATION_THRESHOLD) {
            self.graduate();
        }
    }
    
    // ============================================
    // SELL TOKENS
    // ============================================
    
    receive(msg: SellTokens) {
        require(!self.graduated, "Trade on DEX after graduation");
        require(msg.tokenAmount > 0, "Zero token amount");
        
        let ctx: Context = context();
        
        // Calculate TON return
        let tonOut: Int = self.calculateSell(msg.tokenAmount);
        require(tonOut >= msg.minTonOut, "Slippage exceeded");
        require(tonOut <= self.tonReserve, "Insufficient TON reserve");
        require(tonOut > 0, "Zero TON out");
        
        // Update state
        self.totalSupply -= msg.tokenAmount;
        self.tonReserve -= tonOut;
        self.tokenReserve -= msg.tokenAmount;
        
        // Burn seller's tokens
        self.burn(ctx.sender, msg.tokenAmount);
        
        // Send TON to seller
        send(SendParameters{
            to: ctx.sender,
            value: tonOut,
            mode: SendPayGasSeparately,
            bounce: false,
            body: emptyCell()
        });
        
        // Emit sale event
        emit(TokenSale{
            seller: ctx.sender,
            tokenAmount: msg.tokenAmount,
            tonAmount: tonOut
        }.toCell());
    }
    
    // ============================================
    // BONDING CURVE MATH
    // ============================================
    
    fun calculateBuy(tonIn: Int): Int {
        // Linear bonding curve with upward slope
        // As supply grows, each token costs more TON
        if (self.totalSupply == 0) {
            // First buyer gets initial rate
            return tonIn * self.INITIAL_PRICE;
        }
        
        // Current price based on reserve/supply ratio
        let currentPrice: Int = self.tonReserve / self.totalSupply;
        if (currentPrice == 0) {
            currentPrice = 1;
        }
        
        // Simple linear output (integrate for more accuracy in production)
        let tokensOut: Int = tonIn / currentPrice;
        
        // Apply slight premium to ensure price rises with buys
        // This creates the "pump" effect
        let premiumBps: Int = 50; // 0.5% premium
        tokensOut = tokensOut * (10000 - premiumBps) / 10000;
        
        return tokensOut;
    }
    
    fun calculateSell(tokenAmount: Int): Int {
        if (self.totalSupply == 0) {
            return 0;
        }
        
        let currentPrice: Int = self.tonReserve / self.totalSupply;
        if (currentPrice == 0) {
            currentPrice = 1;
        }
        
        let tonOut: Int = tokenAmount * currentPrice;
        
        // Sell penalty to prevent instant arbitrage
        let penaltyBps: Int = 100; // 1% sell penalty stays in curve
        tonOut = tonOut * (10000 - penaltyBps) / 10000;
        
        return tonOut;
    }
    
    // ============================================
    // JETTON INTERACTIONS
    // ============================================
    
    fun mint(to: Address, amount: Int) {
        require(self.jettonMaster != null, "Jetton master not set");
        
        send(SendParameters{
            to: self.jettonMaster!!,
            value: ton("0.03"),
            mode: SendPayGasSeparately,
            bounce: true,
            body: Mint{
                to: to,
                amount: amount
            }.toCell()
        });
    }
    
    fun burn(from: Address, amount: Int) {
        require(self.jettonMaster != null, "Jetton master not set");
        
        send(SendParameters{
            to: self.jettonMaster!!,
            value: ton("0.03"),
            mode: SendPayGasSeparately,
            bounce: true,
            body: Burn{
                from: from,
                amount: amount
            }.toCell()
        });
    }
    
    // ============================================
    // GRADUATION
    // ============================================
    
    fun graduate() {
        require(!self.graduated, "Already graduated");
        self.graduated = true;
        
        // In production:
        // 1. Deploy DeDust/STON.fi pool
        // 2. Deposit all tonReserve + tokenReserve as liquidity
        // 3. Burn LP tokens permanently (send to zero address)
        // 4. Update this contract to redirect all future trades to DEX
        
        // For now, we lock the contract and emit graduation event
        emit(Graduated{
            token: self.jettonMaster!!,
            tonReserve: self.tonReserve,
            tokenReserve: self.tokenReserve
        }.toCell());
    }
    
    // ============================================
    // GETTERS (for frontend/indexer)
    // ============================================
    
    get fun getPrice(): Int {
        if (self.totalSupply == 0) {
            return self.INITIAL_PRICE;
        }
        let p: Int = self.tonReserve / self.totalSupply;
        return p > 0 ? p : 1;
    }
    
    get fun getState(): CurveState {
        return CurveState{
            totalSupply: self.totalSupply,
            tonReserve: self.tonReserve,
            tokenReserve: self.tokenReserve,
            graduated: self.graduated,
            creator: self.creator,
            price: self.getPrice(),
            platformFeeBps: self.PLATFORM_FEE_BPS,
            creatorFeeBps: self.CREATOR_FEE_BPS
        };
    }
    
    get fun getGraduated(): Bool {
        return self.graduated;
    }
    
    get fun getReserve(): Int {
        return self.tonReserve;
    }
}
