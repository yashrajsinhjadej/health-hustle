// Unit Converter - Convert between different measurement units
// Always converts TO standard units (cm for height, kg for weight)

/**
 * Convert height to centimeters
 * @param {number} value - Height value
 * @param {string} unit - Unit ('cm' or 'ft')
 * @returns {number} Height in centimeters (rounded to 2 decimal places)
 */
function convertHeightToCm(value, unit) {
    if (unit === 'cm') {
        return Math.round(value * 100) / 100; // Round to 2 decimal places
    } else if (unit === 'ft') {
        const cm = value * 30.48; // 1 ft = 30.48 cm
        return Math.round(cm * 100) / 100; // Round to 2 decimal places
    } else {
        throw new Error('Invalid height unit. Must be "cm" or "ft"');
    }
}

/**
 * Convert weight to kilograms
 * @param {number} value - Weight value
 * @param {string} unit - Unit ('kg' or 'lbs')
 * @returns {number} Weight in kilograms (rounded to 2 decimal places)
 */
function convertWeightToKg(value, unit) {
    if (unit === 'kg') {
        return Math.round(value * 100) / 100; // Round to 2 decimal places
    } else if (unit === 'lbs') {
        const kg = value * 0.453592; // 1 lb = 0.453592 kg
        return Math.round(kg * 100) / 100; // Round to 2 decimal places
    } else {
        throw new Error('Invalid weight unit. Must be "kg" or "lbs"');
    }
}

/**
 * Convert height from centimeters to specified unit
 * @param {number} cm - Height in centimeters
 * @param {string} unit - Target unit ('cm' or 'ft')
 * @returns {number} Height in target unit (rounded to 2 decimal places)
 */
function convertCmToUnit(cm, unit) {
    if (unit === 'cm') {
        return Math.round(cm * 100) / 100;
    } else if (unit === 'ft') {
        const ft = cm / 30.48;
        return Math.round(ft * 100) / 100;
    } else {
        throw new Error('Invalid height unit. Must be "cm" or "ft"');
    }
}

/**
 * Convert weight from kilograms to specified unit
 * @param {number} kg - Weight in kilograms
 * @param {string} unit - Target unit ('kg' or 'lbs')
 * @returns {number} Weight in target unit (rounded to 2 decimal places)
 */
function convertKgToUnit(kg, unit) {
    if (unit === 'kg') {
        return Math.round(kg * 100) / 100;
    } else if (unit === 'lbs') {
        const lbs = kg / 0.453592;
        return Math.round(lbs * 100) / 100;
    } else {
        throw new Error('Invalid weight unit. Must be "kg" or "lbs"');
    }
}

/**
 * Validate converted height is within acceptable range
 * @param {number} heightInCm - Height in centimeters
 * @returns {boolean} True if valid, false if invalid
 */
function isValidHeight(heightInCm) {
    return heightInCm >= 50 && heightInCm <= 305;
}

/**
 * Validate converted weight is within acceptable range
 * @param {number} weightInKg - Weight in kilograms
 * @returns {boolean} True if valid, false if invalid
 */
function isValidWeight(weightInKg) {
    return weightInKg >= 10 && weightInKg <= 500;
}

/**
 * Get height range message in specified unit
 * @param {string} unit - Unit ('cm' or 'ft')
 * @returns {string} Range message
 */
function getHeightRangeMessage(unit) {
    if (unit === 'cm') {
        return '50-300 cm';
    } else if (unit === 'ft') {
        const minFt = convertCmToUnit(50, 'ft');
        const maxFt = convertCmToUnit(300, 'ft');
        return `${minFt}-${maxFt} ft`;
    }
    return '50-300 cm';
}

/**
 * Get weight range message in specified unit
 * @param {string} unit - Unit ('kg' or 'lbs')
 * @returns {string} Range message
 */
function getWeightRangeMessage(unit) {
    if (unit === 'kg') {
        return '10-500 kg';
    } else if (unit === 'lbs') {
        const minLbs = convertKgToUnit(10, 'lbs');
        const maxLbs = convertKgToUnit(500, 'lbs');
        return `${minLbs}-${maxLbs} lbs`;
    }
    return '10-500 kg';
}

/**
 * Get display height in user's preferred unit with formatting
 * @param {number} heightInCm - Height stored in cm
 * @param {string} preferredUnit - User's preferred unit ('cm' or 'ft')
 * @returns {object} { value: number, unit: string, display: string }
 */
function getDisplayHeight(heightInCm, preferredUnit = 'cm') {
    if (!heightInCm) return null;
    
    const value = convertCmToUnit(heightInCm, preferredUnit);
    return {
        value: value,
        unit: preferredUnit,
        display: `${value} ${preferredUnit}`
    };
}

/**
 * Get display weight in user's preferred unit with formatting
 * @param {number} weightInKg - Weight stored in kg
 * @param {string} preferredUnit - User's preferred unit ('kg' or 'lbs')
 * @returns {object} { value: number, unit: string, display: string }
 */
function getDisplayWeight(weightInKg, preferredUnit = 'kg') {
    if (!weightInKg) return null;
    
    const value = convertKgToUnit(weightInKg, preferredUnit);
    return {
        value: value,
        unit: preferredUnit,
        display: `${value} ${preferredUnit}`
    };
}

module.exports = {
    convertHeightToCm,
    convertWeightToKg,
    convertCmToUnit,
    convertKgToUnit,
    isValidHeight,
    isValidWeight,
    getHeightRangeMessage,
    getWeightRangeMessage,
    getDisplayHeight,
    getDisplayWeight
};
