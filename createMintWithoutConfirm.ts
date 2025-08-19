import {
    getCreateAccountInstruction
} from "@solana-program/system";

import {
    none,
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
    Commitment, createKeyPairSignerFromBytes, sendTransactionWithoutConfirmingFactory
} from '@solana/kit';

import {
    AccountState,
    extension,
    Extension,
    ExtensionArgs,
    getMintSize,
    getInitializeMintInstruction,
    getInitializeDefaultAccountStateInstruction,
    getInitializeMetadataPointerInstruction,
    getInitializePausableConfigInstruction,
    getInitializeScaledUiAmountMintInstruction,
    getInitializePermanentDelegateInstruction,
    getInitializeTransferHookInstruction,
    getInitializeConfidentialTransferMintInstruction,
    getInitializeTokenMetadataInstruction,
    getInitializeGroupMemberPointerInstruction,
    getInitializeTokenGroupMemberInstruction,
    TOKEN_2022_PROGRAM_ADDRESS
} from '@solana-program/token-2022';

const LAMPORTS_PER_SOL = BigInt(1_000_000_000);

async function main() {
    // 1 - 准备参数
    // const httpProvider = 'http://localhost:8899';

    const httpProvider = 'https://solana-devnet.g.alchemy.com/v2/qRf8iojBOzk1DiHcdkyrj1Ohhm3PtLZt';


    const rpc = createSolanaRpc(httpProvider);
    console.log(`✅ - Established connection to ${httpProvider}`);

    //小数位及元数据
    const DECIMALS = 6;
    const name = "K02 Stock";
    const symbol = "vK02";
    const uri = "https://example.com/mst.json";

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
     * mint相关地址和账户
     */
    //mint地址，预先准备指定开头的地址
    const mint =  await generateKeyPairSigner();
    //mint管理员，预先确定管理员账户，多签？在创建mint过程中需要用来签名
    const mintAuthority = await createKeyPairSignerFromBytes(ownerSeed);
    //交易提交人，支付交易和账户创建费，需要签名
    const payer = mintAuthority;
    //freeze管理员，预先确定账户，多签？
    const freezeAuthorityAddress = address("7N87ktRhyHhmntj5u2C6aNkVY6qs9zkWczhVB65uPH5K");
    //pause管理员，预先确定账户，多签？
    const pauseAuthorityAddress = address("7N87ktRhyHhmntj5u2C6aNkVY6qs9zkWczhVB65uPH5K");
    //metadata和metadataPoint管理员，预先确定账户，多签？
    const metadataAuthorityAddress = address("7N87ktRhyHhmntj5u2C6aNkVY6qs9zkWczhVB65uPH5K");
    //saledUiAmount管理员，预先确定账户，多签？
    const saledUiAmountAuthorityAddress = address("7N87ktRhyHhmntj5u2C6aNkVY6qs9zkWczhVB65uPH5K");
    //saledUiAmount管理员，预先确定账户，多签？
    const transferHookAuthorityAddress = address("7N87ktRhyHhmntj5u2C6aNkVY6qs9zkWczhVB65uPH5K");
    //超级代理员，预先确定账户，多签？
    const permanentDelegateAddress = address("7N87ktRhyHhmntj5u2C6aNkVY6qs9zkWczhVB65uPH5K");
    //隐私交易管理员，多签？
    const confidentialTransferAuthorityAddress = address("7N87ktRhyHhmntj5u2C6aNkVY6qs9zkWczhVB65uPH5K");
    //groupMemberPointer管理员，多签？
    const groupMemberPointerAuthorityAddress = address("7N87ktRhyHhmntj5u2C6aNkVY6qs9zkWczhVB65uPH5K");
    //tokenGroup地址，提前创建好的
    const groupAddress = address("AP1QY2UUN6MkQhBMFkE18LDyAEygkabGHu6HTkyZ9aR3");
    //tokenGroup管理员账户，在创建groupMember过程中需要签名
    const groupAuthority = await createKeyPairSignerFromBytes(groupSeed);

    console.log(`✅ - Generated key pairs`);
    console.log(`     Mint: ${mint.address}`);
    console.log(`     Mint Group: ${groupAddress}`);
    console.log(`     Payer: ${payer.address}`);
    console.log(`     Mint Authority: ${mintAuthority}`);
    console.log(`     Freeze Authority: ${freezeAuthorityAddress}`);
    console.log(`     metadataAuthority Authority: ${metadataAuthorityAddress}`);
    console.log(`     SaledUiAmount Authority: ${saledUiAmountAuthorityAddress}`);
    console.log(`     TransferHook Authority: ${transferHookAuthorityAddress}`);
    console.log(`     Permanent Delegate: ${permanentDelegateAddress}`);
    console.log(`     ConfidentialTransfer Authority: ${confidentialTransferAuthorityAddress}`);

    //2.创建mint
    const defaultAccountStateExtension = extension('DefaultAccountState', {
        state: AccountState.Initialized,
    });

    const pausableConfigExtension = extension('PausableConfig', {
        authority: some(pauseAuthorityAddress),
        paused: false,
    });

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

    const scaledUiAmountMintExtension = extension('ScaledUiAmountConfig', {
        authority:saledUiAmountAuthorityAddress,
        multiplier: 1,
        newMultiplierEffectiveTimestamp: BigInt(0),
        newMultiplier: 1,
    });

    const padding = await generateKeyPairSigner();
    const transferHookExtension = extension('TransferHook', {
        authority: transferHookAuthorityAddress,
        /**
         * @solana-program/token-2022此处有bug，programId不能为空none()，实际上指令支持空
         * 此处仅用于计算扩展所占用空间和rent，可以在这里任意填写一个Address，但是下面的拼装执行指令时填入none()
         */
        programId: padding.address,
    });

    const permanentDelegateExtension = extension('PermanentDelegate', {
        delegate: permanentDelegateAddress,
    });

    const confidentialTransferExtension = extension('ConfidentialTransferMint', {
        authority: some(confidentialTransferAuthorityAddress),
        autoApproveNewAccounts: false,
        auditorElgamalPubkey: none(),
    });

    const groupMemberPointerExtension = extension('GroupMemberPointer', {
        authority: groupMemberPointerAuthorityAddress,
        memberAddress: mint.address,
    });

    const groupMemberExtension =  extension('TokenGroupMember', {
            mint: mint.address,
            group: groupAddress,
            memberNumber: 1,
    });

    const [createMintInstruction, initMintInstruction] =
        await getCreateMintInstructions({
            authority: mintAuthority.address,
            rpc: rpc,
            decimals: DECIMALS,
            extensions: [
                pausableConfigExtension,
                defaultAccountStateExtension,
                metadataPointerExtension,
                tokenMetadataExtension,
                scaledUiAmountMintExtension,
                permanentDelegateExtension,
                transferHookExtension,
                confidentialTransferExtension,
                groupMemberPointerExtension,
                groupMemberExtension
            ],
            freezeAuthority: freezeAuthorityAddress,
            mint,
            payer: payer,
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        });

    const instructions = [
        // Create the Mint Account
        createMintInstruction,

        // Initialize DefaultAccountState
        getInitializeDefaultAccountStateInstruction({
            mint: mint.address,
            state: AccountState.Initialized,
        }),
        // Initialize Pausable
        getInitializePausableConfigInstruction({
            mint: mint.address,
            authority: pauseAuthorityAddress,
        }),
        // Initialize MetadataPointer
        getInitializeMetadataPointerInstruction({
            mint: mint.address,
            authority: metadataAuthorityAddress,
            metadataAddress: mint.address,
        }),
        // Initialize ScaledUiAmount
        getInitializeScaledUiAmountMintInstruction({
            mint: mint.address,
            authority: saledUiAmountAuthorityAddress,
            multiplier: 1,
        }),
        // Initialize TransferHook
        getInitializeTransferHookInstruction({
            mint: mint.address,
            authority: transferHookAuthorityAddress,
            programId: none(),
        }),
        // Initialize PermanentDelegate
        getInitializePermanentDelegateInstruction({
            mint: mint.address,
            delegate: permanentDelegateAddress,
        }),
        // Initialize ConfidentialTransfer
        getInitializeConfidentialTransferMintInstruction({
            mint: mint.address,
            authority: confidentialTransferAuthorityAddress,
            auditorElgamalPubkey: none(),
            autoApproveNewAccounts: false
        }),
        // Initialize GroupMemberPointer
        getInitializeGroupMemberPointerInstruction({
            mint: mint.address,
            authority: groupMemberPointerAuthorityAddress,
            memberAddress: mint.address,
        }),

        // Initialize the Mint
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
        // Initialize GroupMember
        // 初始化token group member的时候除了需要修改当前mint账户状态，还需要通过groupAuthority修改tokenGroup的size，需要两个签名
        getInitializeTokenGroupMemberInstruction({
            member: mint.address,
            memberMint: mint.address,
            //签名
            memberMintAuthority: mintAuthority,
            group: groupAddress,
            //签名
            groupUpdateAuthority: groupAuthority,
        }),
    ];

    const {value: latestBlockhash} = await rpc.getLatestBlockhash().send();

    const sendTransaction = sendTransactionWithoutConfirmingFactory({rpc});
    const signAndSendTransaction = createSignAndSendTransaction(sendTransaction);

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


const createSignAndSendTransaction = (sendTransaction: ReturnType<typeof sendTransactionWithoutConfirmingFactory>) => {
    return async (
        transactionMessage: CompilableTransactionMessage & TransactionMessageWithBlockhashLifetime,
        commitment: Commitment = 'processed',
        skipPreflight: boolean = true
    ) => {
        const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
        try {
            await sendTransaction(signedTransaction, {commitment, skipPreflight});
            return getSignatureFromTransaction(signedTransaction);
        } catch (e) {
            console.error('Transaction failed:', e);
            throw e;
        }
    };
};

main();