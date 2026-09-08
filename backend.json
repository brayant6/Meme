import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano, beginCell, Address } from '@ton/core';
import { BondingCurve } from '../build/bonding_curve/tact_BondingCurve';
import { JettonMaster } from '../build/jetton_master/tact_JettonMaster';
import '@ton/test-utils';

describe('BondingCurve', () => {
    let blockchain: Blockchain;
    let bondingCurve: SandboxContract<BondingCurve>;
    let jettonMaster: SandboxContract<JettonMaster>;
    let creator: SandboxContract<TreasuryContract>;
    let platform: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        creator = await blockchain.treasury('creator');
        platform = await blockchain.treasury('platform');
        buyer = await blockchain.treasury('buyer');

        bondingCurve = blockchain.openContract(
            await BondingCurve.fromInit(creator.address, platform.address)
        );

        const deployResult = await bondingCurve.send(
            creator.getSender(),
            { value: toNano('0.1') },
            { $$type: 'Deploy', queryId: 0n }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: creator.address,
            to: bondingCurve.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy and accept buys', async () => {
        // Set jetton master (mock)
        const jettonAddr = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
        
        await bondingCurve.send(
            creator.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetJettonMaster', jettonMaster: jettonAddr }
        );

        // Buy tokens
        const buyResult = await bondingCurve.send(
            buyer.getSender(),
            { value: toNano('1') },
            { $$type: 'BuyTokens', minTokensOut: 0n }
        );

        expect(buyResult.transactions).toHaveTransaction({
            from: buyer.address,
            to: bondingCurve.address,
            success: true,
        });

        // Check state
        const state = await bondingCurve.getState();
        expect(state.tonReserve).toBeGreaterThan(0n);
    });

    it('should calculate price correctly', async () => {
        const price = await bondingCurve.getPrice();
        expect(price).toBeGreaterThan(0n);
    });
});
