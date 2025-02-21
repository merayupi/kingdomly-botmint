const {ethers} = require('ethers');
const dotenv = require('dotenv');
const rl = require('readline-sync');
const fs= require('node:fs');
const { Twisters } = require('twisters');
dotenv.config();

const twisters = new Twisters();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getInfoNFT = async (contract) => {
    const [name, symbol, supplyInfo] = await Promise.all([
        contract.name(),
        contract.symbol(),
        getSupplyNFT(contract)
    ]);

    const {totalSupply, maxSupply} = supplyInfo;
    console.log(`\nName: ${name}\nSymbol: ${symbol}\nSupply: ${totalSupply}/${maxSupply}`);

    let count = 0;
    const maxSupplyPromises = [];
    while (true) {
        const result = await getmaxSupplyPerMintGroup(contract, count);

        if (count == 7 && result == 0) break;
        maxSupplyPromises.push(result);
        count++;
    }

    const promises = [];
    for (let i = 0; i < count; i++) {
        promises.push(getPrice(contract, i));
        promises.push(checkMaxMintPerwallet(contract, i));
    }

    const results = await Promise.all(promises);

    const formattedStrings = [];
    for (let i = 0; i < count; i++) {
        const price = results[i * 2];
        const maxMintPerWallet = results[i * 2 + 1];
        formattedStrings.push(
            `Mint ID ${i}: ${ethers.formatEther(price.toString())} (max ${maxMintPerWallet}) | Max Supply: ${maxSupplyPromises[i]}`
        );
    }

    formattedStrings.forEach(str => console.log(str));
}

const getSupplyNFT = async (contract) => {
    const totalSupply = await contract.totalSupply();
    const maxSupply = await contract.maxSupply();
    return {totalSupply, maxSupply};
}

const getmaxSupplyPerMintGroup = async (contract, mintID) => {
    return await contract.maxSupplyPerMintGroup(mintID);
}

const checkPublicMint = async (contract,mintID) => {
    return await contract.presaleActive(mintID);
}

const checkMaxMintPerwallet = async (contract,mintID) => {
    return await contract.maxMintPerWallet(mintID);
}

const getPrice = async (contract, groupmint) => {
    return await contract.mintPrice(groupmint);
}

const mintGroupSelection = async () => {
    const options = ['Mint ID 0', 'Mint ID 1', 'Mint ID 2', 'Mint ID 3', 'Mint ID 4', 'Mint ID 5', 'Exit'];
    let option = rl.keyInSelect(options, 'Select an option: ');
    switch(option) {
        case 0:
            return parseInt(0);
        case 1:
            return parseInt(1);
        case 2:
            return parseInt(2);
        case 3:
            return parseInt(3);
        case 4:
            return parseInt(4);
        case 5:
            return parseInt(5);
        case 6:
            process.exit();
    }
}

const mintNFT = async (contract, wallet, quantity, index, mintID) => {

    if(!mintID){
        mintID = mintGroupSelection();
    }

    const value = ( process.env.PRICE + process.env.FEE_KINGDOMLY ) * quantity ;
    const formattedValue = value.toFixed(18);
    try {
        twisters.put(wallet.address, {
            text: `Wallet ${index} | Minting ${quantity} NFTs...`,
        });

        const tx = await contract.batchMint(quantity, mintID, {
            value: ethers.parseEther(formattedValue),
            gasLimit: process.env.GAS_LIMIT,
        });

        const receipt = await tx.wait();

        twisters.put(wallet.address, {
            text: `Wallet ${index} | Minted ${quantity} NFTs!`,
        });

        twisters.put(wallet.address, {
            text: `Wallet ${index} | https://arbiscan.io/tx/${receipt.hash}`,
        });

    } catch (error) {
        const errorMessage = error.shortMessage || "An unexpected error occurred.";
        twisters.put(wallet.address, {
            text: `Wallet ${index} | Error minting NFTs: ${errorMessage}\n`,
        });
        await delay(50);
        await mintNFT(contract, wallet, quantity, index, mintID);
    }
};

const SnipeMintNFT = async (contract, wallet, quantity, index) => {
    try {
        const mintID = await mintGroupSelection();
        console.log("will mint phase: " + mintID);

        while(true){
            const isLive = await contract.mintLive();

            const isPresaleLive = await checkPublicMint(contract,mintID);
            if(isLive && isPresaleLive){
                await mintNFT(contract, wallet, quantity, index,mintID);
                break;
            }else{
                twisters.put(wallet.address, {
                    text: `Wallet ${index} | Minting is not live yet...`,
                });
            }

            await delay(500);
        }
    } catch (error) {
        console.log(error);
    }
}

const menu = async (abi,wallets) => {
    const contractAddressNFT = rl.question('\nEnter the contract address of the NFT: ');
    const contracts = wallets.map(wallet => new ethers.Contract(contractAddressNFT, abi, wallet));

    await getInfoNFT(contracts[0]);

    const options = ['Mint', 'SnipeMint', 'Exit'];
    let option = rl.keyInSelect(options, 'Select an option: ');

    switch(option) {
        case 0:
            const quantity = rl.questionInt('Enter the quantity of NFTs to mint: ');
            await Promise.all(contracts.map((contract, index) => mintNFT(contract, wallets[index], parseInt(quantity), index)));
            break;
        case 1:
            const quantitySnipe = rl.questionInt('Enter the quantity to snipe of NFTs to mint: ');
            await Promise.all(contracts.map((contract, index) => SnipeMintNFT(contract, wallets[index], parseInt(quantitySnipe), index)));
            break;
        case 2:
            process.exit();
    }
}

const main = async () => {
    const privateKeys = fs.readFileSync('./privatekeys.txt', 'utf8').split('\n').filter(key => key.trim() !== '');
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const abi = JSON.parse(fs.readFileSync('./abi.json', 'utf8'));

    const wallets = privateKeys.map(key => new ethers.Wallet(key.trim(), provider));

    console.log("Wallet Information:");
    const balances = await Promise.all(wallets.map(wallet => provider.getBalance(wallet.address)));

    wallets.forEach((wallet, index) => {
        console.log(`Wallet ${index + 1}:`);
        console.log(`Address: ${wallet.address}`);
        console.log(`Balance: ${ethers.formatEther(balances[index])} ETH\n`);
    });

    while (true) {
        await menu(abi, wallets);
    }
}

main();
