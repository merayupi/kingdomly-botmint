const {ethers} = require('ethers');
const dotenv = require('dotenv');
const rl = require('readline-sync');
const fs= require('node:fs');
const { Twisters } = require('twisters');
dotenv.config();

const twisters = new Twisters();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getInfoNFT = async (contract) => {
    const name = await contract.name();
    const symbol = await contract.symbol();
    const {totalSupply, maxSupply} = await getSupplyNFT(contract);
    const [publicPrice, wlPrice] = await Promise.all([
        getPrice(contract, 0),
        getPrice(contract, 1),
        getPrice(contract, 2)
        
    ]);
    const [maxMintPublic, maxMintWL] = await Promise.all([
        checkMaxMintPerwallet(contract, 0),
        checkMaxMintPerwallet(contract, 1)
    ]);

    console.log(`\nName: ${name} \nSymbol: ${symbol} \nPublic: ${ethers.formatEther(publicPrice.toString())} (max ${maxMintPublic}) | WL: ${ethers.formatEther(wlPrice.toString())} (max ${maxMintWL})\nSupply: ${totalSupply}/${maxSupply}`);
}

const getSupplyNFT = async (contract) => {
    const totalSupply = await contract.totalSupply();
    const maxSupply = await contract.maxSupply();
    return {totalSupply, maxSupply};
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
    const options = ['Public', 'WL', 'Ecosistem'];
    let option = rl.keyInSelect(options, 'Select an option: ');
    switch(option) {
        case 0:
            return parseInt(0);
        case 1:
            return parseInt(1);
        case 2:
            return parseInt(2);
        case 3:
            process.exit();
    }
}

const mintNFT = async (contract, wallet, quantity, index, mintID) => {

    if(!mintID){
        mintID = mintGroupSelection();
    }
    // const valueMint = await getPrice(contract,mintID)
    const value = (0+ 0.0015) * quantity ;
    try {
        twisters.put(wallet.address, {
            text: `Wallet ${index} | Minting ${quantity} NFTs...`,
        });

        const tx = await contract.batchMint(quantity, mintID, ethers.ZeroAddress, {
            //todo: change the value to the price of the NFT if free mint 0.0011 eth * quantity  + 0.00001
            value: ethers.parseEther(value.toString()),
            gasLimit: 3000000, 
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
    }
};

const SnipeMintNFT = async (contract, wallet, quantity, index) => {
    try {
        const mintID = await mintGroupSelection();
        console.log("will mint phase: " + mintID);
        // const mintID = 1;
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

            await delay(1000);
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
    // const mintID = mintGroupSelection();
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