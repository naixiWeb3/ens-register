import {createPublicClient, createWalletClient, http, formatEther, isAddress} from 'viem'
import {mainnet} from 'viem/chains'
import {
    addEnsContracts,
    ensPublicActions,
    ensWalletActions,
} from '@ensdomains/ensjs'
import {randomSecret} from '@ensdomains/ensjs/utils'
import {privateKeyToAccount} from "viem/accounts";
import {getAvailable, getName} from "@ensdomains/ensjs/public";
import Logger from '@youpaichris/logger'
import path from "path";
import {fileURLToPath} from 'url';
import fs from "fs";

const __filename = fileURLToPath(import.meta.url)
const logger = new Logger(path.basename(__filename));

const mainnetWithEns = addEnsContracts(mainnet)
const client = createPublicClient({
    chain: mainnetWithEns,
    transport: http(),
}).extend(ensPublicActions)
const year = 31536000
const resolverAddress = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63'

async function getRandomDuration() {
    const random = Math.random()
    if (random < 0.5) {
        return 12
    } else if (random < 0.75) {
        return 4
    } else if (random < 0.875) {
        return 2
    } else {
        return 1
    }
}

async function registerEnsName(privateKey) {
    const account = privateKeyToAccount(privateKey)
    logger.info('Address:', account.address)

    const result = await getName(client, {
        address: account.address,
    })
    if (result?.name) {
        logger.success('Already registered, Name:', result.name)
        return true
    }
    // 随机数random  1 3 6 12 其中 1 的概率为 1/2 3 的概率为 1/4 6 的概率为 1/8 12 的概率为 1/8
    const random = await getRandomDuration()
    logger.info(`register time: ${12 / random} month`)
    const duration = year / random

    const wallet = createWalletClient({
        chain: mainnetWithEns,
        account: account,
        transport: http(),
    }).extend(ensWalletActions)
    const secret = randomSecret()
    logger.info('Secret:', secret)
    //5位整数数随机前缀
    let name = ''
    while (true) {
        const prefix = Math.floor(Math.random() * 100000).toString().padStart(5, '0')
        // 如果 prefix 中包含 4 则continue
        if (prefix.includes('4')) {
            continue
        }
        const tmpName = `${prefix}.eth`
        const isAvailable = await getAvailable(client, {name: tmpName})
        if (isAvailable) {
            name = tmpName
            break
        }
    }
    logger.info('Name:', name)
    const params = {
        name: name,
        owner: account.address,
        duration: duration,
        resolverAddress: resolverAddress,
        reverseRecord: true,
        secret,
    }
    const commitmentHash = await wallet.commitName(params)
    logger.success('Commitment Hash:', commitmentHash)
    await client.waitForTransactionReceipt({hash: commitmentHash}) // wait for commitment to finalise
    await new Promise((resolve) => setTimeout(resolve, 60 * 1_000)) // wait for commitment to be valid
    const {base, premium} = await client.getPrice({
        nameOrNames: params.name,
        duration: params.duration,
    })
    const value = ((base + premium) * 110n) / 100n // add 10% to the price for buffer
    logger.info('registerName Value:', formatEther(value))
    const hash = await wallet.registerName({...params, value})
    logger.success('registerName Hash:', hash)
    await client.waitForTransactionReceipt({hash}) // wait for registration to finalise
    logger.info('Registered:', name)
    const ethAddress = await client.getAddressRecord({name: name})
    return ethAddress.value === account.address
}

async function main() {
    const wallets = fs
        .readFileSync('keys.txt', "utf8")
        .split(/\r?\n/)
        .filter((key) => key);
    for (const content of wallets) {
        const [address, privateKey] = content.split("----");
        if (!address || !privateKey) {
            console.log("数据格式错误");
            continue;
        }
        const success = await registerEnsName(privateKey)
        if (success) {
            fs.appendFileSync('success.txt', `${address}----${privateKey}\n`)
        } else {
            fs.appendFileSync('fail.txt', `${address}----${privateKey}\n`)
        }
    }

}

main().catch(
    (err) => {
        console.error(err);
    }
);