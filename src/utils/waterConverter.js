// Simple Water Conversion Utility
const Logger = require('./logger');

class WaterConverter {
    
    // Simple conversion: 1 glass = 200ml
    static GLASS_TO_ML = 200;
    
    /**
     * Convert glasses to milliliters for storage
     * @param {number} glasses - Number of glasses
     * @returns {number} - Milliliters
     */
    static glassesToMl(glasses) {
        Logger.info('WaterConverter', 'glassesToMl', 'Converting glasses to ml', {
            inputGlasses: glasses,
            outputMl: glasses * this.GLASS_TO_ML
        });
        
        return glasses * this.GLASS_TO_ML;
    }
    
    /**
     * Convert milliliters to glasses for frontend
     * @param {number} ml - Milliliters
     * @returns {number} - Number of glasses
     */
    static mlToGlasses(ml) {
        Logger.info('WaterConverter', 'mlToGlasses', 'Converting ml to glasses', {
            inputMl: ml,
            outputGlasses: ml / this.GLASS_TO_ML
        });
        
        return ml / this.GLASS_TO_ML;
    }
}

module.exports = WaterConverter;
