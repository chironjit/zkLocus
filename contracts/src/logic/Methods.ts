
import { Poseidon, Bool, SelfProof, Empty, Provable, Int64, UInt64, Sign, Field, Proof, Experimental } from "o1js";
import { isPointOnEdgeProvable } from './Geography';

import { GeoPoint, ThreePointPolygon } from '../model/Geography';
import { Int64Prover } from "../math/Provers.js";
import { GeoPointInOutPolygonCommitment, GeoPointInPolygonCommitment, GeoPointWithTimeStampIntervalInPolygonCommitment } from "../model/private/Commitment";
import { TimeStampInterval } from "../model/Time";
import type { GeoPointProviderCircuitProof, TimeStampIntervalProviderCircuitProof } from "../zkprogram/private/Geography";
import type { GeoPointInPolygonCircuitProof } from "../zkprogram/private/GeoPointInPolygonCircuit";
import { OracleGeoPointProviderCircuitProof } from "../zkprogram/private/Oracle";
import { OracleAuthenticatedGeoPointCommitment } from "../model/private/Oracle";


function isPointIn3PointPolygon(
  point: GeoPoint,
  polygon: ThreePointPolygon
): Bool {
  const x: Int64 = point.latitude;
  const y: Int64 = point.longitude;

  let vertices: Array<GeoPoint> = [
    polygon.vertice1,
    polygon.vertice2,
    polygon.vertice3,
  ];
  let inside: Bool = Bool(false);

  const isPointOnEdge1: Bool = isPointOnEdgeProvable(point, polygon.vertice1, polygon.vertice2);
  const isPointOnEdge2: Bool = isPointOnEdgeProvable(point, polygon.vertice2, polygon.vertice3);
  const isPointOnEdge3: Bool = isPointOnEdgeProvable(point, polygon.vertice3, polygon.vertice1);
  const isPointLocatedOnEdge: Bool = isPointOnEdge1.or(isPointOnEdge2).or(isPointOnEdge3);

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi: Int64 = vertices[i].latitude;
    const yi: Int64 = vertices[i].longitude;
    const xj: Int64 = vertices[j].latitude;
    const yj: Int64 = vertices[j].longitude;


    const condition1: Bool = Int64Prover.provableIsInt64XGreaterThanY(yi, y);
    const condition2: Bool = Int64Prover.provableIsInt64XGreaterThanY(yj, y);

    const jointCondition1: Bool = Provable.if(
      condition1.equals(condition2),
      Bool(true),
      Bool(false)
    ).not();

    // NOTE: Provable.log() statements below are commented out and not removed intentionally.
    // They allow for a quick internal view into the state of the raytracing point in polygon algorithm,
    // and allow for a quick and iterative approach to the development. They will, of course, be removed
    // in the future.
    
    //Provable.log('xj:', xj);
    //Provable.log('xi:', xi);
    //Provable.log('yj:', yj);
    //Provable.log('yi:', yi);

    const leftOperand: Int64 = xj.sub(xi);
    const rightOperand: Int64 = y.sub(yi);
    //Provable.log('xj.sub(xi):', leftOperand, leftOperand.magnitude, leftOperand.sgn);
    //Provable.log('y.sub(yi):', rightOperand, rightOperand.magnitude, rightOperand.sgn);

    const magnitudeProduct: UInt64 = leftOperand.magnitude.mul(rightOperand.magnitude);
    const signProduct: Sign = leftOperand.sgn.mul(rightOperand.sgn);

    //Provable.log('magnitudeProduct:', magnitudeProduct);
    //Provable.log('signProduct:', signProduct, signProduct.value, signProduct.isPositive());

    const numerator: Int64 = leftOperand.mul(rightOperand);

    //Provable.log('numerator: ', numerator);
    let denominator: Int64 = yj.sub(yi);
    //Provable.log('denominator: ', denominator);


    // Horizontal Edge case: ensure that division by zero does not occur
    const isHorizontalEdge: Bool = Int64Prover.provableIsInt64XEqualToZero(denominator);
    denominator = Provable.if(isHorizontalEdge, Int64.one, denominator);


    const result_before_addition: Int64 = numerator.div(denominator);
    const result: Int64 = result_before_addition.add(xi);

    let jointCondition2: Bool = Int64Prover.provableIsInt64XLessThanY(x, result);
    // Horizontal Edge case: this will skip the horizontal edge checks
    jointCondition2 = Provable.if(isHorizontalEdge, Bool(false), jointCondition2);

    const isIntersect: Bool = Provable.if(
      jointCondition1.and(jointCondition2),
      Bool(true),
      Bool(false)
    );
    inside = Provable.if(isIntersect, inside.not(), inside);

    // Provable.log('------------------');
    // Provable.log('i: ', i, ' j: ', j);
    // Provable.log('x: ', x, ' y: ', y, 'result: ', result, ' inside: ', inside);
    // Provable.log('jointCondition1: ', jointCondition1);
    // Provable.log('jointCondition2: ', jointCondition2);
    // Provable.log('isIntersect: ', isIntersect);
    // Provable.log('------------------');
  }

  // point on edge is considered inside
  inside = Provable.if(isPointLocatedOnEdge, Bool(true), inside);

  return inside;
}

export function proveGeoPointIn3PointPolygon(
  point: GeoPoint,
  polygon: ThreePointPolygon
): GeoPointInPolygonCommitment {
  // TODO: IT IS CRUCIAL TO VERIFY THAT THE FACTOR OF THE POINT IS THE SAME
  // AS THE FACTOR OF ALL OF THE POINTS OF THE POLYGON. Oterwise, the math
  // will fail. Consider implementing this check as another proof.
  // The argument could be a proof that returns a struct that contains both
  // of the values provided as arguments. That proof should also validate
  // that the provided latitude and longitude values are within the accepted
  // values.
  //Provable.log('Proving that point is in polygon...');
  const isInPolygon: Bool = isPointIn3PointPolygon(point, polygon);

  // If point in polygon, return the commitment data
  const polygonCommitment = polygon.hash();
  const coordinatesCommitment = point.hash();

  //Provable.log('Polygon Commitment: ', polygonCommitment);
  //Provable.log('Coordinates Commitment: ', coordinatesCommitment);
  //Provable.log('Is In Polygon: ', isInPolygon);

  return new GeoPointInPolygonCommitment({
    polygonCommitment: polygonCommitment,
    geoPointCommitment: coordinatesCommitment,
    isInPolygon: isInPolygon,
  });
}

/**
 * Proves that a GeoPoint is inside or outside of a polygon with source-attested coordinate source.
 * This provides the foundational framework and a dynamic interface for the creation of proof with
 * verified coordinate source. This coordinate source could be the result of a request to an API,
 * the zero-knowledge proof from a hardware device, or a signature by some private key. This allows
 * for the dynamic creation of proofs with the source of coordinate verified by arbitrary logic.
 * This interface can be connected to through the use of proof recursion.
 * 
 * Wether or not to trust the source is up to the verifier of the proof. They will be able to verify exactly which
 * set of circuits created that proof.
 *  
 * @param sourcedGeoPointProof - the proof that the GeoPoint is sourced from a specific source
 * @param polygon 
 * @returns 
 */
export async function proveProvidedGeoPointIn3PointPolygon(
  sourcedGeoPointProof: GeoPointProviderCircuitProof,
  polygon: ThreePointPolygon,
): Promise<GeoPointInPolygonCommitment> {
  Provable.log("Verifying...");
  sourcedGeoPointProof.verify();
  Provable.log("Verified!");
  const point: GeoPoint = sourcedGeoPointProof.publicOutput;
  const commitment: GeoPointInPolygonCommitment =  proveGeoPointIn3PointPolygon(point, polygon);
  Provable.log("Returning commitment...");
  Provable.asProver(() => {
    Provable.log('Finished proving that point is in polygon...')
    Provable.log('Point: [', point.latitude.toString(), point.longitude.toString(), point.factor.toString(), ']');
    Provable.log('Polygon: [', polygon.vertice1.latitude.toString(), polygon.vertice1.longitude.toString(), polygon.vertice1.factor.toString(), '], [', polygon.vertice2.latitude.toString(), polygon.vertice2.longitude.toString(), polygon.vertice2.factor.toString(), '], [', polygon.vertice3.latitude.toString(), polygon.vertice3.longitude.toString(), polygon.vertice3.factor.toString(), ']');
 });
  return commitment;
}

function ANDLiteral(first: GeoPointInPolygonCommitment, second: GeoPointInPolygonCommitment) {
  // ensure that the proof is for the same coordinates

  Provable.log('Verifying that the proofs are for the same coordinates...')
  first.geoPointCommitment.assertEquals(
    second.geoPointCommitment
  );

  // NOTE: see note below on .OR
  // ensure that the proof is not done for the same polygon
  //proof1.publicOutput.polygonCommitment.assertNotEquals(
  // proof2.publicOutput.polygonCommitment
  //);

  Provable.log('Verifying for inside of polygons...')

  
  // ensure that the proofs are either both for isInPolygon, or both not for isInPolygon
  const isInPolygon: Bool = first.isInPolygon.and(second.isInPolygon);
  Provable.log('Building commitment...')
  const commitment = new GeoPointInPolygonCommitment({
    polygonCommitment: Poseidon.hash([
      first.polygonCommitment,
      second.polygonCommitment,
    ]),
    geoPointCommitment: first.geoPointCommitment,
    isInPolygon: isInPolygon,
  });
  Provable.asProver(() => {
    Provable.log("first.polygonCommitment: ", first.polygonCommitment.toString())
    Provable.log("second.polygonCommitment: ", second.polygonCommitment.toString());
    Provable.log("Polygon Commitment: ", commitment.polygonCommitment.toString())
    Provable.log("Coordinates Commitment: ", commitment.geoPointCommitment.toString())
    Provable.log("Is In Polygon: ", commitment.isInPolygon.toString())
  });
  Provable.log("Returning commitment...")
  return commitment;

}

/**
 * Given two proofs, it combines them into a single proof that is the AND of the two proofs.
 * The AND operand is applied to the `isInPolygon` field of the two proofs. The proof is computed
 * even if neither of the proofs have `isInPolygon` set to true. The proof verifies that the
 * `coordinatesCommitment` are the same, and that the `polygonCommitment` are different.
 * @param proof1 - the first proof
 * @param proof2  - the second proof
 * @returns CoordinateProofState
 */

export async function AND(
  proof1: GeoPointInPolygonCircuitProof,
  proof2: GeoPointInPolygonCircuitProof
): Promise<GeoPointInPolygonCommitment> {
  // IMPORTANT: A caveat of this AND. If you give proof1, which asserts that the user is in Spain, and proof2 that
  // asserts that the user is not in Romania, then the resulting proof from .AND will say that the user is
  // not in Spain AND Romania. This is because the AND operation is applied to the `isInPolygon` field
  // of the two proofs. This is coherent with the "isPointInPolygon" logic, as the resulting proof attests
  // whether the point IS IN polygon. As such, the AND logic is applied to whether the point IS IN polygon 1 AND IN polygon 2.

  // A separate piece of functionality is is to have a proof that asserts that the user is in Spain AND is not in Romania.
  // For correctness, this method/proof should opearate ensuring that the values of `isInPolygon` is the same
  // in both proofs: either both are true, or both are false. If they are different, then the proof should
  // fail. This way the proof will attest to either the user being inside a set of polygons, or outside of that set.
  // A good solution for this appears to be to separate proofs. The proofs in CoordinatesInPolygon should only attest to
  // either the presence or the abcense of the user from a polygon, or a set of polygons. Simple polygons are combined
  // into more complex shapes using the AND and OR operations. There should be another ZKProgram, that takes as input
  // a set of proofs from CoordinatesInPolygon ZKProgram, checks their isInPolygon values, and then combines them
  // into another proof whose public output includes a commitment to the polygons in which the user is in, and
  // to the polygons in which the user is not. Wether this should be implemented or not should be carefully considered.
  // It's important to note, that the existing system can be combined to achieve the same result, but it may not be as
  // convenient as having a single proof that attests to the presence or absence of the user from a set of polygons.
  // Proving that you are in Romania or Spain, means proving that you are NOT in the rest of the world.
  // The additional ZKProgram described above can be implemented as an additional feature. It can be considered
  // as a nice to have. The new ZKProgram would accept two proofs which have CoordinateProofState as their public output,
  // and combine them into a public output which whould add all of the `isInPolygon=True` polygons to `insidePolygonCommitment`,
  // and all of the `isInPolygon=False` polygons to `outsidePolygonCommitment`. The new ZKProgram would also verify that
  // the `coordinatesCommitment` of the two proofs are the same, and that the `polygonCommitment` are different.

  Provable.log("Verifying proof1...");
  proof1.verify();
  Provable.log("Verifying proof2...");
  proof2.verify();
  console.log("Proof1 and Proof2 verified")

  const proof1PublicOuput: GeoPointInPolygonCommitment = proof1.publicOutput;
  const proof2PublicOuput: GeoPointInPolygonCommitment = proof2.publicOutput;

  const returnValue = ANDLiteral(proof1PublicOuput, proof2PublicOuput);
  Provable.log("Returning result of AND...")
  return returnValue;
}

function ORLiteral(
  first: GeoPointInPolygonCommitment,
  second: GeoPointInPolygonCommitment
) {
  // ensure that the proof is for the same coordinates
  first.geoPointCommitment.assertEquals(
    second.geoPointCommitment
  );

  // NOTE: I have decided to forego for this check, as there could be a use-case for combining
  // different location proofs about the same polygon, as the proofs could have different coordinate
  // sources. This would allow for the end-user to combine proofs about the same polygon, but from
  // different sources. For example, a user could combine a proof from a GPS sensor, with a proof
  // from a cell tower, and a proof from a WiFi hotspot. This would allow for the end-user to
  // combine proofs from different sources, and achieve a higher level of confidence that they
  // are inside or outside of the polygon. The decision on whether the to trust the coordinate sources
  // or not is left to the receiving party.
  // ensure that the proof is not done for the same polygon
  //proof1.publicOutput.polygonCommitment.assertNotEquals(
  //  proof2.publicOutput.polygonCommitment
  //);
  // logic of OR
  let isInPolygon = Provable.if(
    first.isInPolygon.or(second.isInPolygon),
    Bool(true),
    Bool(false)
  );

  return new GeoPointInPolygonCommitment({
    polygonCommitment: Poseidon.hash([
      first.polygonCommitment,
      second.polygonCommitment,
    ]),
    geoPointCommitment: first.geoPointCommitment,
    isInPolygon: isInPolygon,
  });
}

/**
 * Given two proofs, it combines them into a single proof that is the OR of the two proofs.
 * The OR operand is applied to the `isInPolygon` field of the two proofs. The proof is computed
 * even if neither of the proofs have `isInPolygon` set to true. The proof verifies that the
 * `coordinatesCommitment` are the same, and that the `polygonCommitment` are different.
 * @param proof1 - the first proof
 * @param proof2 - the second proof
 * @returns CoordinateProofState
 */

export async function OR(
  proof1: GeoPointInPolygonCircuitProof,
  proof2: GeoPointInPolygonCircuitProof
): Promise<GeoPointInPolygonCommitment> {
  proof1.verify();
  proof2.verify();

  const first: GeoPointInPolygonCommitment = proof1.publicOutput;
  const second: GeoPointInPolygonCommitment = proof2.publicOutput;

  return ORLiteral(first, second);


} 

export async function combine(
  proof1: SelfProof<Empty, GeoPointInOutPolygonCommitment>,
  proof2: SelfProof<Empty, GeoPointInOutPolygonCommitment>
): Promise<GeoPointInOutPolygonCommitment> {
  proof1.verify();
  proof2.verify();

  const proof1PublicOutput: GeoPointInOutPolygonCommitment = proof1.publicOutput;
  const proof2PublicOutput: GeoPointInOutPolygonCommitment = proof2.publicOutput;

  // ensure that the proof is for the same coordinates
  proof1.publicOutput.coordinatesCommitment.assertEquals(
    proof2.publicOutput.coordinatesCommitment
  );

  // Ensure that we are not combining identical proofs. An identical proof
  // is a proof that commits to the samae inside and outside polygon commitments
  const isInsidePolygonCommitmentEqual: Bool = Provable.if(
    proof1PublicOutput.insidePolygonCommitment.equals(
      proof2PublicOutput.insidePolygonCommitment
    ),
    Bool(true),
    Bool(false)
  );
  const isOutsidePolygonCommitmentEqual: Bool = Provable.if(
    proof1PublicOutput.outsidePolygonCommitment.equals(
      proof2PublicOutput.outsidePolygonCommitment
    ),
    Bool(true),
    Bool(false)
  );

  // this will only fail the assertion, if both, the inside and outside polygon commitments are equal
  isInsidePolygonCommitmentEqual
    .and(isOutsidePolygonCommitmentEqual)
    .assertEquals(Bool(false));

  const isInsideCommitmentPresentInProof1: Bool = Provable.if(
    proof1PublicOutput.insidePolygonCommitment.equals(Field(0)),
    Bool(false),
    Bool(true)
  );
  const isInsideCommitmentPresentInProof2: Bool = Provable.if(
    proof2PublicOutput.insidePolygonCommitment.equals(Field(0)),
    Bool(false),
    Bool(true)
  );
  const isOutsideCommitmentPresentInProof1: Bool = Provable.if(
    proof1PublicOutput.outsidePolygonCommitment.equals(Field(0)),
    Bool(false),
    Bool(true)
  );
  const isOutsideCommitmentPresentInProof2: Bool = Provable.if(
    proof2PublicOutput.outsidePolygonCommitment.equals(Field(0)),
    Bool(false),
    Bool(true)
  );

  // Inside commitments of Proof1 and Proof2 should only be combined if they're non-zero. Here is how the value of the combined inside commitment is calculated:
  // * Proof1's and Proof2's inside commitments are non-Field(0): Poseidon.hash([Proof1, Proof2])
  // * Proof1==Field(0) and Proof2!=Field(0): Proof2
  // * Proof1!=Field(0) and Proof2==Field(0): Proof1
  // * Proof1==Field(0) and Proof2==Field(0): Field(0)
  // First, compute the joint hash, in case both of the fields are provided
  const newInsideCommitmentBothPresent: Field = Poseidon.hash([
    proof1PublicOutput.insidePolygonCommitment,
    proof2PublicOutput.insidePolygonCommitment,
  ]);

  // Now, iteratively build up ot the final hash. The idea is to start with an assumption that both proofs were provided. After that,
  // we ensure that hte assumption is correct by verifying the other conditions. The answer is only altered if one of the
  // conditions sets a new reality.
  // 1. If only proof1 is present, set to the value of proof1, otherwise, joint proof
  let newInsideCommitment = Provable.if(
    isInsideCommitmentPresentInProof1.and(
      isInsideCommitmentPresentInProof2.not()
    ),
    proof1PublicOutput.insidePolygonCommitment,
    newInsideCommitmentBothPresent
  );
  // 2. Only change the value of the commitment if proof1 is not presen and proof2 is present
  newInsideCommitment = Provable.if(
    isInsideCommitmentPresentInProof1
      .not()
      .and(isInsideCommitmentPresentInProof2),
    proof2PublicOutput.insidePolygonCommitment,
    newInsideCommitment
  );
  // 3. Only set the commitemnt explicitly to Field(0) if neither proof1, nor proof2 were provided
  newInsideCommitment = Provable.if(
    isInsideCommitmentPresentInProof1
      .not()
      .and(isInsideCommitmentPresentInProof2.not()),
    Field(0),
    newInsideCommitment
  );

  const newOutsideCommitmentBothPresent: Field = Poseidon.hash([
    proof1PublicOutput.outsidePolygonCommitment,
    proof2PublicOutput.outsidePolygonCommitment,
  ]);

  let newOutsideCommitment: Field = Provable.if(
    isOutsideCommitmentPresentInProof1.and(
      isOutsideCommitmentPresentInProof2.not()
    ),
    proof1PublicOutput.outsidePolygonCommitment,
    newOutsideCommitmentBothPresent
  );
  newOutsideCommitment = Provable.if(
    isOutsideCommitmentPresentInProof1
      .not()
      .and(isInsideCommitmentPresentInProof2),
    proof2PublicOutput.outsidePolygonCommitment,
    newOutsideCommitment
  );
  newInsideCommitment = Provable.if(
    isInsideCommitmentPresentInProof1
      .not()
      .and(isInsideCommitmentPresentInProof2.not()),
    Field(0),
    newOutsideCommitment
  );

  return new GeoPointInOutPolygonCommitment({
    insidePolygonCommitment: newInsideCommitment,
    outsidePolygonCommitment: newOutsideCommitment,
    coordinatesCommitment: proof1PublicOutput.coordinatesCommitment,
  });
}

export async function fromCoordinatesInPolygonProof(
  proof: SelfProof<Empty, GeoPointInPolygonCommitment>
): Promise<GeoPointInOutPolygonCommitment> {
  proof.verify();

  const coodinatesInPolygonProof: GeoPointInPolygonCommitment = proof.publicOutput;
  const insideCommitment = Provable.if(
    coodinatesInPolygonProof.isInPolygon,
    coodinatesInPolygonProof.polygonCommitment,
    Field(0)
  );
  const outsideCommitment = Provable.if(
    coodinatesInPolygonProof.isInPolygon,
    Field(0),
    coodinatesInPolygonProof.polygonCommitment
  );

  return new GeoPointInOutPolygonCommitment({
    insidePolygonCommitment: insideCommitment,
    outsidePolygonCommitment: outsideCommitment,
    coordinatesCommitment: coodinatesInPolygonProof.geoPointCommitment,
  });
}

export async function proofGeoPointInPolygonCommitmentFromOutput(
  output: GeoPointInPolygonCommitment
): Promise<GeoPointInPolygonCommitment> {
  return output;
}

/**
 * Attach interval timestamp to the proof that the coordinates are in a polygon. 
 * @param geoPointInPolygonProof Proof that the coordinates are in a polygon
 * @param timestampIntervralProof Proof of source of timestamp interval
 * @returns GeoPoint with inclusion in polygon and time stamp interval information
 */
export async function proofAttachSourcedTimestampinterval(geoPointInPolygonProof: GeoPointInPolygonCircuitProof, timestampIntervralProof: TimeStampIntervalProviderCircuitProof): Promise<GeoPointWithTimeStampIntervalInPolygonCommitment> {
  geoPointInPolygonProof.verify();
  timestampIntervralProof.verify();

  const geoPointInPolygonCommitment: GeoPointInPolygonCommitment = geoPointInPolygonProof.publicOutput;
  const timestampInterval: TimeStampInterval = timestampIntervralProof.publicOutput;

  return new GeoPointWithTimeStampIntervalInPolygonCommitment({
    geoPointInPolygonCommitment: geoPointInPolygonCommitment,
    timestamp: timestampInterval,
  });
}

/**
 * Given two sources GeoPointWithTimeStampIntervalInPolygonCommitment proofs, it combines them into a single proof that is the AND of the two proofs. 
 * This method requires for the time intervals to be equal in both proofs. A set of utility methods is provided to compress or extend a time interval,
 * and they can be used to adapt the time intervals to be equal, as long as they are compatible with one another.s 
 * @param firstProof first proof
 * @param secondProof second proof
 * @returns combination of both proofs
 */
export async function geoPointWithTimeStampInPolygonAND(firstProof: SelfProof<Empty, GeoPointWithTimeStampIntervalInPolygonCommitment>, secondProof: SelfProof<Empty, GeoPointWithTimeStampIntervalInPolygonCommitment>): Promise<GeoPointWithTimeStampIntervalInPolygonCommitment> {
  firstProof.verify();
  secondProof.verify();

  const firstProofPublicOutput: GeoPointWithTimeStampIntervalInPolygonCommitment = firstProof.publicOutput;
  const secondProofPublicOutput: GeoPointWithTimeStampIntervalInPolygonCommitment = secondProof.publicOutput;

  const firstProofTimeStampInterval: TimeStampInterval = firstProofPublicOutput.timestamp;
  const secondProofTimeStampInterval: TimeStampInterval = secondProofPublicOutput.timestamp;

  // Ensure that time intervals are equal. A set of utility methods is provided to compress or extend a time interval
  firstProofTimeStampInterval.hash().assertEquals(secondProofTimeStampInterval.hash());

  // Combine the polygon commitments
  const geoPointInPolygonCommitment: GeoPointInPolygonCommitment = ANDLiteral(firstProofPublicOutput.geoPointInPolygonCommitment, secondProofPublicOutput.geoPointInPolygonCommitment);


  return new GeoPointWithTimeStampIntervalInPolygonCommitment({
    geoPointInPolygonCommitment: geoPointInPolygonCommitment,
    timestamp: firstProofTimeStampInterval,
  });
}

export async function geoPointWithTimeStampInPolygonOR(firstProof: SelfProof<Empty, GeoPointWithTimeStampIntervalInPolygonCommitment>, secondProof: SelfProof<Empty, GeoPointWithTimeStampIntervalInPolygonCommitment>): Promise<GeoPointWithTimeStampIntervalInPolygonCommitment> {
  firstProof.verify();
  secondProof.verify();

  const firstProofPublicOutput: GeoPointWithTimeStampIntervalInPolygonCommitment = firstProof.publicOutput;
  const secondProofPublicOutput: GeoPointWithTimeStampIntervalInPolygonCommitment = secondProof.publicOutput;

  const firstProofTimeStampInterval: TimeStampInterval = firstProofPublicOutput.timestamp;
  const secondProofTimeStampInterval: TimeStampInterval = secondProofPublicOutput.timestamp;

  // Ensure that time intervals are equal. A set of utility methods is provided to compress or extend a time interval
  firstProofTimeStampInterval.hash().assertEquals(secondProofTimeStampInterval.hash());

  // Combine the polygon commitments
  const geoPointInPolygonCommitment: GeoPointInPolygonCommitment = ORLiteral(firstProofPublicOutput.geoPointInPolygonCommitment, secondProofPublicOutput.geoPointInPolygonCommitment);

  return new GeoPointWithTimeStampIntervalInPolygonCommitment({
    geoPointInPolygonCommitment: geoPointInPolygonCommitment,
    timestamp: firstProofTimeStampInterval,
  });
}

/**
 * Expand the time interval of a GeoPointWithTimeStampIntervalInPolygonCommitment proof. This method is useful for adapting time intervals for AND and OR operations.
 * This method only succeeds if the provided time interval is a super set of the original time interval.
 * @param commitment - the proof to expand
 * @param newTimeStampInterval  - the new time interval
 */
export async function expandTimeStampInterval(commitment: GeoPointWithTimeStampIntervalInPolygonCommitment, newTimeStampInterval: TimeStampInterval): Promise<GeoPointWithTimeStampIntervalInPolygonCommitment> {
  commitment.timestamp.start.assertLessThanOrEqual(newTimeStampInterval.start);
  commitment.timestamp.end.assertGreaterThanOrEqual(newTimeStampInterval.end);

  return new GeoPointWithTimeStampIntervalInPolygonCommitment({
    geoPointInPolygonCommitment: commitment.geoPointInPolygonCommitment,
    timestamp: newTimeStampInterval,
  });

}

/**
 * Recurvisevely expand the time interval of a GeoPointWithTimeStampIntervalInPolygonCommitment proof on the GeoPointWithTimeStampIntervalInPolygonCommitment. 
 * This method is useful for adapting time intervals for AND and OR operations. 
 * @param proof - Recursive proof with GeoPointWithTimeStampIntervalInPolygonCommitment as public output to expand
 * @param newTimeStampInterval  - the new and expanded time stamp interval.
 * @returns 
 */
export async function expandTimeStampIntervalRecursive(proof: SelfProof<Empty, GeoPointWithTimeStampIntervalInPolygonCommitment>, newTimeStampInterval: TimeStampInterval): Promise<GeoPointWithTimeStampIntervalInPolygonCommitment> {
  proof.verify();

  const proofPublicOutput: GeoPointWithTimeStampIntervalInPolygonCommitment = proof.publicOutput;

  return expandTimeStampInterval(proofPublicOutput, newTimeStampInterval);
}

export async function geoPointFromLiteral(point: GeoPoint): Promise<GeoPoint> {
  return point;
}

export async function timeStampIntervalFromLiteral(interval: TimeStampInterval): Promise<TimeStampInterval> {
  return interval;
}

/*
  Given an oracle-signed GeoPoint, this method verifies that the signature is valid, and that the
  claimed GeoPoint is the same as the one that was signed.
*/
export async function exactGeoPointFromOracle(
  oracleProof: OracleGeoPointProviderCircuitProof,
  geoPoint: GeoPoint,
): Promise<GeoPoint> {
  oracleProof.verify();

  const geoPointCommitnemt: OracleAuthenticatedGeoPointCommitment = oracleProof.publicOutput;
  const geoPointHash: Field = geoPoint.hash();

  geoPointHash.assertEquals(geoPointCommitnemt.geoPointHash);
  return geoPoint;
}
