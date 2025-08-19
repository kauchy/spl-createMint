import {
    getCreateAccountInstruction
} from "@solana-program/system";

import {
    some,
    address,
    Address,
    Rpc,
    SolanaRpcApi,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    generateKeyPairSigner,
    sendAndConfirmTransactionFactory,
    CompilableTransactionMessage,
    signTransactionMessageWithSigners,
    getSignatureFromTransaction,
    TransactionMessageWithBlockhashLifetime,
    pipe,
    createTransactionMessage,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstructions,
    setTransactionMessageFeePayerSigner,
    TransactionSigner,
    Commitment,
    createKeyPairSignerFromBytes
} from '@solana/kit';

import {
    extension,
    Extension,
    ExtensionArgs,
    getMintSize,
    getInitializeMintInstruction,
    getInitializeMetadataPointerInstruction,
    getInitializeTokenMetadataInstruction,
    getInitializeGroupPointerInstruction,
    getInitializeTokenGroupInstruction,
    TOKEN_2022_PROGRAM_ADDRESS
} from '@solana-program/token-2022';


async function main() {
    // 1 - 准备参数
    const httpProvider = 'http://localhost:8899';
    const wssProvider = 'ws://localhost:8900';

    // const httpProvider = 'https://api.devnet.solana.com';
    // const wssProvider = 'wss://api.devnet.solana.com';

    // const httpProvider = 'https://solana-devnet.gateway.tatum.io';
    // const wssProvider = 'wss://solana-devnet.gateway.tatum.io';

    const rpc = createSolanaRpc(httpProvider);
    const rpcSubscriptions = createSolanaRpcSubscriptions(wssProvider);
    console.log(`✅ - Established connection to ${httpProvider}`);

    //小数位及元数据
    const DECIMALS = 6;
    const name = 'vStock Group';
    const symbol = 'vGroup';
    const uri = 'https://example.com/mst.json';

    const ownerSeed = new Uint8Array([
        55,243,96,172,193,169,176,154,229,209,150,66,130,138,255,245,185,173,109,207,9,153,33,
        118,0,220,215,122,215,65,13,122,94,143,93,125,97,45,199,23,92,7,18,80,227,17,208,114,
        210,32,223,227,60,140,4,136,254,19,116,38,130,87,80,170
    ]);

    const groupSeed = new Uint8Array([
        182, 202, 128, 188, 97, 130, 197, 199, 70, 114, 188, 212, 252, 1, 67, 13, 237, 24, 77, 139, 243, 135, 226, 82, 216,
        20, 224, 164, 193, 91, 33, 54, 210, 204, 168, 245, 95, 143, 8, 222, 209, 181, 55, 86, 81, 248,
        228, 210, 174, 227, 215, 182, 100, 37, 13, 106, 167, 137, 99, 48, 46, 139, 253, 127
    ]);

    /**
     * mint Group相关地址和账户
     */
    //mintGroup地址，预先准备指定开头的地址
    const mint = await generateKeyPairSigner();
    //mintGroup的mint管理员，预先确定管理员账户，多签？在创建mint过程中需要用来签名
    const mintAuthority = await createKeyPairSignerFromBytes(ownerSeed);
    //交易提交人，支付交易和账户创建费，需要签名
    const payer = mintAuthority;
    //groupPointer管理员，多签？
    const groupPointerAuthorityAddress = await address("7N87ktRhyHhmntj5u2C6aNkVY6qs9zkWczhVB65uPH5K");
    //metadata和metadataPoint管理员，预先确定账户，多签？
    const metadataAuthorityAddress = address("7N87ktRhyHhmntj5u2C6aNkVY6qs9zkWczhVB65uPH5K");

    //tokenGroup管理员账户
    const groupAuthority = await createKeyPairSignerFromBytes(groupSeed);

    console.log(`✅ - Generated key pairs`);
    console.log(`     Mint Group: ${mint.address}`);
    console.log(`     Payer: ${payer.address}`);
    console.log(`     MintGroup Authority: ${mintAuthority.address}`);
    console.log(`     metadataAuthority Authority: ${metadataAuthorityAddress}`);
    console.log(`     groupUpdateAuthority Authority: ${groupAuthority.address}`);

    //2.创建TokenGroup
    const metadataPointerExtension = extension('MetadataPointer', {
        authority: some(metadataAuthorityAddress),
        metadataAddress: some(mint.address),
    });

    const tokenMetadataExtension = extension('TokenMetadata', {
        updateAuthority: some(metadataAuthorityAddress),
        mint: mint.address,
        name: name,
        symbol: symbol,
        uri: uri,
        additionalMetadata: new Map<string, string>(),
    });

    const groupPointerExtension = extension('GroupPointer', {
        authority: groupPointerAuthorityAddress,
        groupAddress: mint.address,
    });

    const tokenGroupExtension = extension('TokenGroup', {
        updateAuthority: groupAuthority.address,
        mint: mint.address,
        size: 0,
        maxSize: 1000,
    });


    const [createMintInstruction, initMintInstruction] =
        await getCreateMintInstructions({
            authority: mintAuthority.address,
            rpc: rpc,
            decimals: DECIMALS,
            extensions: [
                metadataPointerExtension,
                tokenMetadataExtension,
                groupPointerExtension,
                tokenGroupExtension,
            ],
            mint: mint,
            payer: payer,
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        });

    const instructions = [
        // Create the MintGroup Account
        createMintInstruction,

        // Initialize MetadataPointer
        getInitializeMetadataPointerInstruction({
            mint: mint.address,
            authority: metadataAuthorityAddress,
            metadataAddress: mint.address,
        }),

        // Initialize TokenGroupPointer
        getInitializeGroupPointerInstruction({
            mint: mint.address,
            authority: groupAuthority.address,
            groupAddress: mint.address,
        }),

        // Initialize the MintGroup
        initMintInstruction,

        // Initialize TokenMetadata
        getInitializeTokenMetadataInstruction({
            metadata: mint.address,
            updateAuthority: metadataAuthorityAddress,
            mint: mint.address,
            //签名
            mintAuthority: mintAuthority,
            name: name,
            symbol: symbol,
            uri: uri,
        }),

        // Initialize TokenGroup
        getInitializeTokenGroupInstruction({
            group: mint.address,
            updateAuthority: groupAuthority.address,
            mint: mint.address,
            //签名
            mintAuthority: mintAuthority,
            maxSize: 1000,
        }),
    ];

    const {value: latestBlockhash} = await rpc.getLatestBlockhash().send();

    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({rpc, rpcSubscriptions});
    const signAndSendTransaction = createSignAndSendTransaction(sendAndConfirmTransaction);

    const createMintTxid = await pipe(
        createTransactionMessage({version: 0}),
        (tx) => setTransactionMessageFeePayerSigner(payer, tx),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstructions(instructions, tx),
        (tx) => signAndSendTransaction(tx)
    );
    console.log(`✅ - Mint account created and initialized: ${createMintTxid}`);

}

export const getCreateMintInstructions = async (input: {
    authority: Address;
    rpc: Rpc<SolanaRpcApi>;
    decimals?: number;
    extensions?: ExtensionArgs[];
    freezeAuthority?: Address;
    mint: TransactionSigner;
    payer: TransactionSigner;
    programAddress?: Address;
}) => {
    const space = getMintSize(input.extensions);
    const postInitializeExtensions: Extension['__kind'][] = [
        'TokenMetadata',
        'TokenGroup',
        'TokenGroupMember',
    ];
    const spaceWithoutPostInitializeExtensions = input.extensions
        ? getMintSize(
            input.extensions.filter(
                (e) => !postInitializeExtensions.includes(e.__kind)
            )
        )
        : space;
    const rent = await input.rpc
        .getMinimumBalanceForRentExemption(BigInt(space))
        .send();
    return [
        getCreateAccountInstruction({
            payer: input.payer,
            newAccount: input.mint,
            lamports: rent,
            space: spaceWithoutPostInitializeExtensions,
            programAddress: input.programAddress ?? TOKEN_2022_PROGRAM_ADDRESS,
        }),
        getInitializeMintInstruction({
            mint: input.mint.address,
            decimals: input.decimals ?? 0,
            freezeAuthority: input.freezeAuthority,
            mintAuthority: input.authority,
        }),
    ];
};


const createSignAndSendTransaction = (sendAndConfirmTransaction: ReturnType<typeof sendAndConfirmTransactionFactory>) => {
    return async (
        transactionMessage: CompilableTransactionMessage & TransactionMessageWithBlockhashLifetime,
        commitment: Commitment = 'processed',
        skipPreflight: boolean = true
    ) => {
        const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
        try {
            await sendAndConfirmTransaction(signedTransaction, {commitment, skipPreflight});
            return getSignatureFromTransaction(signedTransaction);
        } catch (e) {
            console.error('Transaction failed:', e);
            throw e;
        }
    };
};

main();