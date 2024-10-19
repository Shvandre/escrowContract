import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';

export type EscrowConfig = {
    adminAddress: Address;
    contractId: number;
};

// INFORMAL STORAGE TLB  SCHEME
// storage_data#_ 
//      successful_init:Bool  
//      jetton_wallet_address:MsgAddress    if we are ton_escrow then must be Null address ($00)
//      grams:Grams 
//      admin_address:MsgAddressInt
//      seller_address:MsgAddressInt
//      successful_deposit:Bool
//      contract_id: uint64                to deploy multiple contracts
//      Buyer_address:^MsgAddressInt
//      = StorageData;

export function escrowConfigToCell(config: EscrowConfig): Cell {
    return beginCell()
    .storeUint(0, 1) // Successfull init
    .storeUint(0, 2) // Jetton wallet address
    .storeCoins(0) // Grams
    .storeAddress(config.adminAddress) // Admin address
    .storeUint(0, 2) // Seller address
    .storeUint(0, 1) // Successfull deposit
    .storeUint(config.contractId, 64) // Contract id
    .storeRef(beginCell().storeUint(0, 2).endCell()) // Buyer address
    .endCell();
}

export const Opcodes = {
    init_jetton_escrow: 0xdd54e640,
    init_ton_escrow: 0xdb4d22ac,
    deposit_ton: 0x17638dd1,
    jetton_trasfer: 0x0f8a7ea5,
    trasfer_notification: 0x7362d09c,
    deposit_jetton: 0x7ec367ec,
    sellet_payoff: 0x42d1fd1b,
};

export class Escrow implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Escrow(address);
    }

    static createFromConfig(config: EscrowConfig, code: Cell, workchain = 0) {
        const data = escrowConfigToCell(config);
        const init = { code, data };
        return new Escrow(contractAddress(workchain, init), init);
    }

    async sendDeployTonEscrow(provider: ContractProvider, via: Sender, tonAmount: bigint) {
        await provider.internal(via, {
            value: toNano("1.2"),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
            .storeUint(Opcodes.init_ton_escrow, 32)
            .storeUint(0, 64)
            .storeCoins(tonAmount)
            .endCell(),
        });
    }
    async sendDeployJettonEscrow(provider: ContractProvider, via: Sender, jettonAmount: bigint, jettonWallet: Address) {
        await provider.internal(via, {
            value: toNano("1.2"),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
            .storeUint(Opcodes.init_jetton_escrow, 32)
            .storeUint(0, 64)
            .storeAddress(jettonWallet)
            .storeCoins(jettonAmount)
            .endCell(),
        });
    }

    async sendDepositTon(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value: value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.deposit_ton, 32)
                .storeUint(0, 64)
                .endCell(),
        });
    }

    async sendDepositJetton(provider: ContractProvider, via: Sender, jettonAmount: bigint, jettonSender: Address) {
        await provider.internal(via, {
            value: toNano("0.1"),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.trasfer_notification, 32)
                .storeUint(0, 64)
                .storeCoins(jettonAmount)
                .storeAddress(jettonSender)
                .storeUint(0, 1)
                .endCell(),
        });
    }

    async sendSellerPayoff(provider: ContractProvider, via: Sender) {
        await provider.internal(via, {
            value: toNano("0.1"),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.sellet_payoff, 32)
                .storeUint(0, 64)
                .endCell(),
        });
    }

    async getIsBuyerFound(provider: ContractProvider) {
        const result = await provider.get('is_buyer_found', []);
        return result.stack.readBoolean();
    }
    async getIsContractInitialized(provider: ContractProvider) {
        const result = await provider.get('is_contract_initialized', []);
        return result.stack.readBoolean();
    }
    async getAdminAddress(provider: ContractProvider) {
        const result = await provider.get('get_admin_address', []);
        return result.stack.readAddress();
    }
    async getSellerAddress(provider: ContractProvider) {
        const result = await provider.get('get_seller_address', []);
        return result.stack.readAddress();
    }
    async getBuyerAddress(provider: ContractProvider) {
        const result = await provider.get('get_buyer_address', []);
        return result.stack.readAddress();
    }
}
