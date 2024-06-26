
import { Account, AccountUpdate, Field, Mina, Poseidon, PrivateKey, PublicKey, Signature, UInt64 } from "o1js";
import { ZKLContract } from "../../../../blockchain/contracts/tokens/zkl/ZKLContract";
import { BountyBulletinBoardContract } from "../../../../blockchain/contracts/bounty/BountyBulletinBoardContract";
import { dirname } from 'path';
import { DeployeeSC } from "../../../../blockchain/contracts/experiments/DeployeeSC";
import { DeployerSC } from "../../../../blockchain/contracts/experiments/DeployerSC";
import { DeployerVerificationSC } from "../../../../blockchain/contracts/experiments/DeployerVerificationSC";

describe('ZKL Token Smart Contract', async () => {
  const Local = await Mina.LocalBlockchain();
  Local.setProofsEnabled(false);
  // let Berkeley = Mina.Network('https://proxy.berkeley.minaexplorer.com/graphql');
  let zklSC: ZKLContract;
  const deployerPrivateKey: PrivateKey = Local.testAccounts[0].key;
  //const feePayer: PrivateKey = PrivateKey.fromBase58(PRIVATE_KEY)
  const deployerPublicKey: PublicKey = deployerPrivateKey.toPublicKey();

  const interactor1PrivateKey: PrivateKey = Local.testAccounts[1].key;
  const interactor1PublicKey: PublicKey = interactor1PrivateKey.toPublicKey();

  const interactor2PrivateKey: PrivateKey = Local.testAccounts[2].key;
  const interactor2PublicKey: PublicKey = interactor2PrivateKey.toPublicKey();

  const transactionFee: number = 100_000_000;

  const zklAppPrivateKey: PrivateKey = PrivateKey.random();
  const zklAppAddress: PublicKey = zklAppPrivateKey.toPublicKey();

  const bbbAppprivateKey: PrivateKey = PrivateKey.random();
  const bbbAppAddress: PublicKey = bbbAppprivateKey.toPublicKey();

  zklSC = new ZKLContract(zklAppAddress);
  const bbbSC: BountyBulletinBoardContract = new BountyBulletinBoardContract(bbbAppAddress);

  const firstFundedAddr: PublicKey = bbbSC.deriveBountyAccountAddress(interactor1PublicKey, UInt64.from(1));

  let deployerSCVerificationKey: { data: string, hash: Field };
  let deployeeSCVerificationKey: { data: string, hash: Field };
  let deployerVerificationSCVerificationKey: { data: string, hash: Field };

  beforeAll(async () => {
    console.log("Compiling circuits...");
    const startTime = Date.now();
    // Empty here for now
    const endTime = Date.now();
    console.log("Compilation complete!");
    console.log(`Proofs compilation took ${endTime - startTime} milliseconds.`);

    Mina.setActiveInstance(Local);
    //Mina.setActiveInstance(Berkeley);

    console.log("Compiling smart contracts...");
    const startTimeSC = Date.now();
    deployerSCVerificationKey = (await DeployerSC.compile()).verificationKey;
    deployeeSCVerificationKey = (await DeployeeSC.compile()).verificationKey;
    deployerVerificationSCVerificationKey = (await DeployerVerificationSC.compile()).verificationKey;
    const endTimeSC = Date.now();
    console.log("Compilation complete!");
    console.log(`Smart contract compilation took ${endTimeSC - startTimeSC} milliseconds.`);
  });

  describe('Bounty Bulletin Board Integration Basics', async () => {

    it('Deploy of child account is successful', async () => {
      const deployerSCPrivateKey: PrivateKey = PrivateKey.random();
      const deployerContract: DeployerSC = new DeployerSC(deployerSCPrivateKey.toPublicKey());

      const deployerDeployTxn = await Mina.transaction(
        deployerPublicKey, async () => {
          AccountUpdate.fundNewAccount(deployerPublicKey);
          await deployerContract.deploy({ verificationKey: deployerSCVerificationKey});
        });
      await deployerDeployTxn.prove();
      await deployerDeployTxn.sign([deployerPrivateKey, deployerSCPrivateKey]).send();

      const deployeeSCPrivateKey: PrivateKey = PrivateKey.random();
      const deployeeContract: DeployeeSC = new DeployeeSC(deployeeSCPrivateKey.toPublicKey());
      const deployeeDeployTxn = await Mina.transaction(
        deployerPublicKey, async () => {
          AccountUpdate.fundNewAccount(deployerPublicKey);
          await deployerContract.deployDeployee(deployerPublicKey, deployeeSCPrivateKey.toPublicKey(), deployeeSCVerificationKey);
        });
      await deployeeDeployTxn.prove();
      await deployeeDeployTxn.sign([deployerPrivateKey, deployeeSCPrivateKey]).send();

      const deployerVal: Field = deployeeContract.deployer.getAndRequireEquals();
      const expectedDeployerVal: Field = Poseidon.hash(deployerPublicKey.toFields());
      expect(deployerVal).toEqual(expectedDeployerVal);
    });

    it.only('Verify deployment of child account is successful', async () => {

      console.log(`Verification key: ${deployeeSCVerificationKey.hash.toString()}`)

      const deployerSCPrivateKey: PrivateKey = PrivateKey.random();
      const deployerContract: DeployerSC = new DeployerSC(deployerSCPrivateKey.toPublicKey());

      const deployerDeployTxn = await Mina.transaction(
        deployerPublicKey, async () => {
          AccountUpdate.fundNewAccount(deployerPublicKey);
          await deployerContract.deploy({ verificationKey: deployerSCVerificationKey});
        });
      await deployerDeployTxn.prove();
      await deployerDeployTxn.sign([deployerPrivateKey, deployerSCPrivateKey]).send();

      const deployeeSCPrivateKey: PrivateKey = PrivateKey.random();
      const deployeeContract: DeployeeSC = new DeployeeSC(deployeeSCPrivateKey.toPublicKey());
      const deployeeDeployTxn = await Mina.transaction(
        deployerPublicKey, async () => {
          AccountUpdate.fundNewAccount(deployerPublicKey);
          await deployerContract.deployDeployee(deployerPublicKey, deployeeSCPrivateKey.toPublicKey(), deployeeSCVerificationKey);
        });
      await deployeeDeployTxn.prove();
      await deployeeDeployTxn.sign([deployerPrivateKey, deployeeSCPrivateKey]).send();

      const deployerVal: Field = deployeeContract.deployer.getAndRequireEquals();
      const expectedDeployerVal: Field = Poseidon.hash(deployerPublicKey.toFields());
      expect(deployerVal).toEqual(expectedDeployerVal);

      const deployerVerificationSCPrivateKey: PrivateKey = PrivateKey.random();
      const deployerVerificationSC: DeployerVerificationSC = new DeployerVerificationSC(deployerVerificationSCPrivateKey.toPublicKey());
      const deployerVerificationSCDeployTxn = await Mina.transaction(
        deployerPublicKey, async () => {
          AccountUpdate.fundNewAccount(deployerPublicKey);
          await deployerVerificationSC.deploy({ verificationKey: deployerVerificationSCVerificationKey });
        });

      await deployerVerificationSCDeployTxn.prove();
      await deployerVerificationSCDeployTxn.sign([deployerPrivateKey, deployerVerificationSCPrivateKey]).send();

    });
  });

});
