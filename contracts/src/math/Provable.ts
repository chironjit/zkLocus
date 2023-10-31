import { Bool, Int64, Provable, Sign } from "o1js";

/*
* Asserts that x is greater than y, i.e. x > y.
* Properly uses provable code with assertions.
*/
export function provableIsInt64XGreaterThanY(x: Int64, y: Int64): Bool {
  /*
    if both signs are Positive:
        the largest maginitude is greater
    if both signs are Negative:
        the smallest maginitude is greater
   
    if signs are different:
        the postivie number is greater

    special case for x == y: always false
  */
  // 1. Are the signs the same?
  // if they're the same, the their multiplication's result is a positive sign
  const signMuliplictaion: Sign = x.sgn.mul(y.sgn);
  const isSignsEqual: Bool = Provable.if(signMuliplictaion.isPositive(), Bool(true), Bool(false));

  // 2. For the case of the signs begin equal, we need to decide wether the one with the largest magintude
  const isXiMagnitudeLargerThanY: Bool = Provable.if(x.magnitude.greaterThan(y.magnitude), Bool(true), Bool(false));
  const isXMagitudeSmallerThanY: Bool = Provable.if(x.magnitude.lessThan(y.magnitude), Bool(true), Bool(false));
  const isXandYEqual: Bool = Provable.if(x.equals(y), Bool(true), Bool(false));

  let isXGreaterThanYIfXandYAreEqual: Bool = Provable.if(x.sgn.isPositive(), isXiMagnitudeLargerThanY, isXMagitudeSmallerThanY);
  // spcial case for x == y: always false
  isXGreaterThanYIfXandYAreEqual = Provable.if(isXandYEqual, Bool(false), isXGreaterThanYIfXandYAreEqual);


  // 3. For the case of the signs being different, the positive number is always greater.
  const isXGreaterThanYIfTheSignsAreDifferent: Bool = Provable.if(x.sgn.isPositive(), Bool(true), Bool(false));

  // 4. If the sings are equal, we return the result o 2. (isXGreaterThanYIfXandYAreEqual), otherwise we return the result of 3. (isXGreaterThanYIfTheSignsAreDifferent).
  const isXGreaterThanY: Bool = Provable.if(isSignsEqual, isXGreaterThanYIfXandYAreEqual, isXGreaterThanYIfTheSignsAreDifferent);
  return isXGreaterThanY;
}

export function provableIsInt64XEqualToInt64Y(x: Int64, y: Int64): Bool {
  const isXandYZero: Bool = Provable.if(x.equals(Int64.zero).and(y.equals(Int64.zero)), Bool(true), Bool(false));
  const isMaginitudeEqual: Bool = Provable.if(x.magnitude.equals(y.magnitude), Bool(true), Bool(false));
  const isSignEqual: Bool = Provable.if(x.sgn.equals(y.sgn), Bool(true), Bool(false));
  const isSignAndMaginitudeEqual: Bool = Provable.if(isMaginitudeEqual.and(isSignEqual), Bool(true), Bool(false));
  const isXEqualToY: Bool = Provable.if(isXandYZero, Bool(false), isSignAndMaginitudeEqual);
  return isXEqualToY;

}

/**
 * Proves wether x is less than y and returns the result.
 * The logic is defiend in terms of greaterThan and Equality:
 * x is less than y only if not(x is more than y) and not(x is equal to y)
 * @param x left operatnd Int64
 * @param y right operand Int64 
 */
export function provableIsInt64XLessThanY(x: Int64, y: Int64): Bool {
  const isXGreaterThanY: Bool = provableIsInt64XGreaterThanY(x, y);
  const isXEqualToY: Bool = Provable.if(x.equals(y), Bool(true), Bool(false));
  const isXLessThanY: Bool = Provable.if(isXGreaterThanY.not().and(isXEqualToY.not()), Bool(true), Bool(false));
  return isXLessThanY;
}