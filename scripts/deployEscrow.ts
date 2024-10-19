import { toNano } from '@ton/core';
import { Escrow } from '../wrappers/Escrow';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const escrow = provider.open(
        Escrow.createFromConfig(
            {
                id: Math.floor(Math.random() * 10000),
                counter: 0,
            },
            await compile('Escrow')
        )
    );

    await escrow.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(escrow.address);

    console.log('ID', await escrow.getID());
}
