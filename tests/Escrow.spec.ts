import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract, Verbosity } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { Escrow, Opcodes } from '../wrappers/Escrow';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import e from 'express';
import { randomAddress } from '@ton/test-utils';



describe('Escrow', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Escrow');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let jettonWallet: SandboxContract<TreasuryContract>;
    let adminWallet: SandboxContract<TreasuryContract>;
    let escrowTon: SandboxContract<Escrow>;
    let escrowJetton: SandboxContract<Escrow>;
    let escrowTonAmount: bigint = toNano('100');
    let escrowJettonAmount: bigint = toNano('666');
    
    beforeEach(async () => {
        blockchain = await Blockchain.create();

        //Comment next 3 lines in order to disable vmLogs
        let cur_vecbosity = blockchain.verbosity;
        cur_vecbosity.vmLogs = "vm_logs"
        blockchain.verbosity = cur_vecbosity;

        buyer = await blockchain.treasury('buyer');
        deployer = await blockchain.treasury('deployer');
        jettonWallet = await blockchain.treasury('jettonWallet');
        adminWallet = await blockchain.treasury('adminWallet');

        escrowTon = blockchain.openContract(
            Escrow.createFromConfig(
                {
                    adminAddress: adminWallet.address,
                    contractId: 0,
                },
                code
            )
        );
        escrowJetton = blockchain.openContract(
            Escrow.createFromConfig(
                {
                    adminAddress: adminWallet.address,
                    contractId: 1,
                },
                code
            )
        );
        

        const deployResult = await escrowTon.sendDeployTonEscrow(deployer.getSender(), escrowTonAmount);
        
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowTon.address,
            deploy: true,
            success: true,
        });
        expect(await escrowTon.getIsContractInitialized()).toBe(true);

        const deployResultJetton = await escrowJetton.sendDeployJettonEscrow(deployer.getSender(), 
                                                                            escrowJettonAmount, 
                                                                            jettonWallet.address);
        expect(deployResultJetton.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowJetton.address,
            deploy: true,
            success: true,
        });
        expect(await escrowJetton.getIsContractInitialized()).toBe(true);
    });

    it('should deploy', async () => {

        expect((await escrowTon.getAdminAddress()).equals(adminWallet.address)).toBe(true);
        // the check is done inside beforeEach
        // blockchain and escrow are ready to use
    });

    it('should receive sufficient ton deposit', async () => {
        const depositResult = await escrowTon.sendDepositTon(deployer.getSender(), escrowTonAmount + toNano("0.2")); //0.2 ton for fees
        
        expect(depositResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowTon.address,
            deploy: false,
            success: true,
        });
        expect(await escrowTon.getIsBuyerFound()).toBe(true);
        expect((await escrowTon.getBuyerAddress()).equals(deployer.address)).toBe(true);
    });

    it('should receive more than sufficient ton deposit and return extra TONs back', async () => {

        const depositX2Result = await escrowTon.sendDepositTon(deployer.getSender(), escrowTonAmount * BigInt(2));

        expect(depositX2Result.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowTon.address,
            deploy: false,
            success: true,
        });

        expect(depositX2Result.transactions).toHaveTransaction({
            from: escrowTon.address,
            to: deployer.address,
            deploy: false,
            success: true,
            value: (value) => value! >= escrowTonAmount - toNano('0.1'), // 0.1 is the fee
        });
        expect(await escrowTon.getIsBuyerFound()).toBe(true);
    });
    it('should ignore insufficient ton deposit', async () => {
        const depositResult = await escrowTon.sendDepositTon(deployer.getSender(), escrowTonAmount - toNano('1'));

        expect(depositResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowTon.address,
            deploy: false,
            success: false,
        });

        expect(depositResult.transactions).toHaveTransaction({
            from: escrowTon.address,
            to: deployer.address,
            body: (body) => body!.beginParse().loadUint(32) === 0xffffffff, // Bounced transaction
        });
        expect(await escrowTon.getIsBuyerFound()).toBe(false);
    });

    it('should receive sufficient jetton deposit', async () => {
        const jettonSender = randomAddress();
        const depositResult = await escrowJetton.sendDepositJetton(jettonWallet.getSender(), escrowJettonAmount, jettonSender);

        expect(depositResult.transactions).toHaveTransaction({
            from: jettonWallet.address,
            to: escrowJetton.address,
            deploy: false,
            success: true,
        });
        expect(await escrowJetton.getIsBuyerFound()).toBe(true);
    });

    it('should receive more than sufficient jetton deposit', async() => {
        const jettonSender = randomAddress();
        const depositX2Result = await escrowJetton.sendDepositJetton(jettonWallet.getSender(), escrowJettonAmount * BigInt(2), jettonSender);

        expect(depositX2Result.transactions).toHaveTransaction({
            from: jettonWallet.address,
            to: escrowJetton.address,
            deploy: false,
            success: true,
        });
        expect(await escrowJetton.getIsBuyerFound()).toBe(true);
    });
    it('should ignore insufficient jetton deposit', async () => {
        const jettonSender = randomAddress();
        const depositResult = await escrowJetton.sendDepositJetton(jettonWallet.getSender(), escrowJettonAmount - toNano('1'), jettonSender);

        expect(depositResult.transactions).toHaveTransaction({
            from: jettonWallet.address,
            to: escrowJetton.address,
            deploy: false,
            success: false,
            exitCode: 707,
        });
        expect(await escrowJetton.getIsBuyerFound()).toBe(false);
    });
    it('should ignore jetton deposit from wrong wallet', async () => {
        const jettonSender = randomAddress();
        const depositResult = await escrowJetton.sendDepositJetton(deployer.getSender(), escrowJettonAmount, randomAddress());

        expect(depositResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowJetton.address,
            deploy: false,
            success: false,
            exitCode: 708,
        });
        expect(await escrowJetton.getIsBuyerFound()).toBe(false);
    });
    it('should ignore jetton deposit if contract is for tonDeposit', async () => {
        const depositResult = await escrowTon.sendDepositJetton(jettonWallet.getSender(), escrowJettonAmount, randomAddress());

        expect(depositResult.transactions).toHaveTransaction({
            from: jettonWallet.address,
            to: escrowTon.address,
            deploy: false,
            success: false,
        });
        expect(await escrowJetton.getIsBuyerFound()).toBe(false);
    });
    it('should ignore ton deposit if contract is for jettonDeposit', async () => {
        const depositResult = await escrowJetton.sendDepositTon(deployer.getSender(), escrowTonAmount);

        expect(depositResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowJetton.address,
            deploy: false,
            success: false,
        });
        expect(await escrowTon.getIsBuyerFound()).toBe(false);
    });
    it('should pay TON to seller and Royalty to admin if evetyrhing is correct', async ()=> {

        const depositResult = await escrowTon.sendDepositTon(deployer.getSender(), escrowTonAmount + toNano("0.2")); //0.2 ton for fees
        
        expect(depositResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowTon.address,
            deploy: false,
            success: true,
        });
        
        const payoffResult = await escrowTon.sendSellerPayoff(adminWallet.getSender());

        expect(payoffResult.transactions).toHaveTransaction({
            from: escrowTon.address,
            to: deployer.address,
            deploy: false,
            success: true,
            op: 0xc7c1982e, // op::successful_payoff
        });
        

        //Admin royalty payoff
        expect(payoffResult.transactions).toHaveTransaction({
            from: escrowTon.address,
            to: adminWallet.address,
            deploy: false,
            success: true,
            op: 0xdb8f99a9, // op::royalty_payoff
        });
    });

    it('should pay Jetton to seller and Royalty to admin if evetyrhing is correct', async ()=> {
        const jettonSender = randomAddress();
        const depositResult = await escrowJetton.sendDepositJetton(jettonWallet.getSender(), escrowJettonAmount, jettonSender);

        expect(depositResult.transactions).toHaveTransaction({
            from: jettonWallet.address,
            to: escrowJetton.address,
            deploy: false,
            success: true,
        });

        const payoffResult = await escrowJetton.sendSellerPayoff(adminWallet.getSender());

        expect(payoffResult.transactions).toHaveTransaction({
            from: escrowJetton.address,
            to: jettonWallet.address,
            deploy: false,
            success: true,
            op: 0xf8a7ea5, // op::trasfer
        })

        //Admin royalty payoff
        expect(payoffResult.transactions).toHaveTransaction({
            from: escrowJetton.address,
            to: adminWallet.address,
            deploy: false,
            success: true,
            op: 0xdb8f99a9, // op::royalty_payoff
        });
    });
    
    it('should refund TON to buyer if admin requested refund', async ()=> {
        const depositResult = await escrowTon.sendDepositTon(deployer.getSender(), escrowTonAmount + toNano("0.2")); //0.2 ton for fees
        
        expect(depositResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrowTon.address,
            deploy: false,
            success: true,
        });
        
        const refundResult = await escrowTon.sendBuyerRefund(adminWallet.getSender());
        
        for(let tx of refundResult.transactions){
            console.log(tx.debugLogs);
        }

        //Admin royalty payoff
        expect(refundResult.transactions).toHaveTransaction({
            from: escrowTon.address,
            to: adminWallet.address,
            deploy: false,
            success: true,
            op: Opcodes.royalty_payoff,
        });

        expect(refundResult.transactions).toHaveTransaction({
            from: escrowTon.address,
            to: deployer.address,
            deploy: false,
            success: true,
            op: Opcodes.buyer_refund, // op::refund
        });
        

        
    });
    
    it('should refund Jetton to buyer if admin requested refund', async ()=> {
        const jettonSender = randomAddress();
        const depositResult = await escrowJetton.sendDepositJetton(jettonWallet.getSender(), escrowJettonAmount, jettonSender);

        expect(depositResult.transactions).toHaveTransaction({
            from: jettonWallet.address,
            to: escrowJetton.address,
            deploy: false,
            success: true,
        });

        const refundResult = await escrowJetton.sendBuyerRefund(adminWallet.getSender());

        expect(refundResult.transactions).toHaveTransaction({
            from: escrowJetton.address,
            to: adminWallet.address,
            deploy: false,
            success: true,
            op: Opcodes.royalty_payoff
        });

        expect(refundResult.transactions).toHaveTransaction({
            from: escrowJetton.address,
            to: jettonWallet.address,
            deploy: false,
            success: true,
            op: Opcodes.jetton_trasfer, // op::trasfer
            body: beginCell()
            .storeUint(Opcodes.jetton_trasfer, 32)
            .storeUint(0, 64)
            .storeCoins(escrowJettonAmount)
            .storeAddress(jettonSender)
            .storeAddress(jettonSender)
            .storeUint(0, 1)
            .storeCoins(1)
            .storeUint(0, 1)
            .endCell()
        });
    });
});
