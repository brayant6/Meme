import "@stdlib/deploy";
import "@stdlib/ownable";
import "@stdlib/jetton";

// ============================================
// JETTON STANDARD IMPLEMENTATION
// ============================================

message Mint {
    to: Address;
    amount: Int as coins;
}

message Burn {
    from: Address;
    amount: Int as coins;
}

contract JettonMaster with JettonMaster, Deployable, Ownable {
    
    totalSupply: Int as coins = 0;
    mintable: Bool = true;
    owner: Address;
    content: Cell;
    jettonWalletCode: Cell;
    
    // Token metadata
    name: String;
    symbol: String;
    description: String;
    image: String;
    
    init(owner: Address, content: Cell, jettonWalletCode: Cell, name: String, symbol: String, description: String, image: String) {
        self.owner = owner;
        self.content = content;
        self.jettonWalletCode = jettonWalletCode;
        self.name = name;
        self.symbol = symbol;
        self.description = description;
        self.image = image;
    }
    
    receive(msg: Mint) {
        // Only BondingCurve can mint
        self.requireOwner();
        require(self.mintable, "Not mintable");
        
        self.totalSupply += msg.amount;
        
        let winit: StateInit = self.getJettonWalletInit(msg.to);
        send(SendParameters{
            to: contractAddress(winit),
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: TokenTransferInternal{
                queryId: 0,
                amount: msg.amount,
                from: myAddress(),
                responseAddress: myAddress(),
                forwardTonAmount: 0,
                forwardPayload: emptyCell().asSlice()
            }.toCell(),
            code: winit.code,
            data: winit.data
        });
    }
    
    receive(msg: Burn) {
        self.requireOwner();
        
        // Burn from user's wallet
        let winit: StateInit = self.getJettonWalletInit(msg.from);
        send(SendParameters{
            to: contractAddress(winit),
            value: ton("0.05"),
            bounce: true,
            body: TokenBurnNotification{
                queryId: 0,
                amount: msg.amount,
                owner: msg.from,
                responseAddress: myAddress()
            }.toCell()
        });
        
        self.totalSupply -= msg.amount;
    }
    
    get fun getTotalSupply(): Int {
        return self.totalSupply;
    }
    
    get fun getName(): String {
        return self.name;
    }
    
    get fun getSymbol(): String {
        return self.symbol;
    }
}
