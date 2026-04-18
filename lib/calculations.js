/**
 * Calculate wallpaper requirements for a set of walls.
 *
 * @param {Array} walls - Array of wall objects { widthM, heightM, deductions: [{widthM, heightM}] }
 * @param {number} rollWidthCm - Roll width in centimeters
 * @param {number} rollLengthM - Roll length in meters
 * @param {number} pricePerRoll - Price per roll in UZS
 * @returns {Object} { totalSqm, netSqm, rollsNeeded, lengthNeededM, rollWidthM, totalPrice, wastePercent }
 */
export function calculateWallpaper(walls, rollWidthCm, rollLengthM, pricePerRoll) {
  const rollWidthM = rollWidthCm / 100;
  const rollSqm = rollWidthM * rollLengthM;

  let totalGrossSqm = 0;
  let totalDeductionSqm = 0;

  for (const wall of walls) {
    const wallSqm = (wall.widthM || 0) * (wall.heightM || 0);
    totalGrossSqm += wallSqm;

    const deductions = wall.deductions || [];
    for (const ded of deductions) {
      totalDeductionSqm += (ded.widthM || 0) * (ded.heightM || 0);
    }
  }

  const netSqm = Math.max(0, totalGrossSqm - totalDeductionSqm);

  // Add 10% waste factor
  const sqmWithWaste = netSqm * 1.1;

  // Calculate strips needed based on roll width
  // Each strip covers one roll width horizontally
  // Number of full-width strips needed
  const stripsNeeded = rollWidthM > 0
    ? Math.ceil(walls.reduce((sum, wall) => sum + (wall.widthM || 0), 0) / rollWidthM)
    : 0;

  // Wall height average for strip length
  const avgHeight =
    walls.length > 0
      ? walls.reduce((sum, wall) => sum + (wall.heightM || 0), 0) / walls.length
      : 0;

  // Length needed total (strips × avg height with 10% waste)
  const lengthNeededM = stripsNeeded * avgHeight * 1.1;

  // Rolls needed: total sqm with waste / sqm per roll, rounded up
  const rollsNeeded = rollSqm > 0 ? Math.ceil(sqmWithWaste / rollSqm) : 0;

  const totalPrice = rollsNeeded * (pricePerRoll || 0);

  return {
    totalGrossSqm: +totalGrossSqm.toFixed(2),
    totalDeductionSqm: +totalDeductionSqm.toFixed(2),
    netSqm: +netSqm.toFixed(2),
    sqmWithWaste: +sqmWithWaste.toFixed(2),
    rollsNeeded,
    lengthNeededM: +lengthNeededM.toFixed(2),
    rollWidthM: +rollWidthM.toFixed(2),
    rollSqm: +rollSqm.toFixed(2),
    totalPrice,
    wastePercent: 10,
  };
}

/**
 * Calculate sqm from rolls
 */
export function rollsToSqm(rolls, rollWidthCm, rollLengthM) {
  const rollWidthM = rollWidthCm / 100;
  return rolls * rollWidthM * rollLengthM;
}

/**
 * Calculate rolls from sqm (with optional waste factor)
 */
export function sqmToRolls(sqm, rollWidthCm, rollLengthM, wastePercent = 10) {
  const rollWidthM = rollWidthCm / 100;
  const rollSqm = rollWidthM * rollLengthM;
  if (rollSqm <= 0) return 0;
  const sqmWithWaste = sqm * (1 + wastePercent / 100);
  return Math.ceil(sqmWithWaste / rollSqm);
}

/**
 * Calculate length needed from sqm and roll width
 */
export function sqmToLength(sqm, rollWidthCm) {
  const rollWidthM = rollWidthCm / 100;
  if (rollWidthM <= 0) return 0;
  return +(sqm / rollWidthM).toFixed(2);
}

/**
 * Calculate profit margin
 */
export function calculateMargin(revenue, cost) {
  if (!revenue || revenue === 0) return 0;
  return +((((revenue - cost) / revenue) * 100).toFixed(2));
}

/**
 * Calculate item total for a sale line
 */
export function calculateItemTotal(sqm, rollWidthCm, rollLengthM, pricePerRoll) {
  const rolls = sqmToRolls(sqm, rollWidthCm, rollLengthM, 0);
  return {
    rolls,
    lengthM: sqmToLength(sqm, rollWidthCm),
    total: rolls * pricePerRoll,
  };
}
