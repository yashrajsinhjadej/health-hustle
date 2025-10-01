// Health Analytics Service - Centralized data fetching for different time periods
const DailyHealthData = require('../models/DailyHealthData');

class HealthAnalyticsService {
    /**
     * Get health data for a specific period
     * @param {String} userId - User ID
     * @param {String} period - '7days', '30days', '12months', '1year'
     * @param {Array} fields - Fields to include ['sleep', 'water', 'steps', etc.]
     * @returns {Object} Formatted health data with summary
     */
    static async getHealthData(userId, period = '7days', fields = ['sleep']) {
        const { startDate, endDate, groupBy } = this.getDateRange(period);
        
        let query = DailyHealthData.find({
            userId,
            date: { $gte: startDate, $lte: endDate }
        }).sort({ date: 1 });

        // Select only needed fields for performance
        const selectFields = ['date', 'userId', ...fields].join(' ');
        query = query.select(selectFields).lean();

        const data = await query;
        
        return {
            period,
            startDate,
            endDate,
            totalDays: data.length,
            data: this.formatDataForPeriod(data, fields, groupBy),
            summary: this.generateSummary(data, fields, period)
        };
    }

    /**
     * Get date range based on period
     */
    static getDateRange(period) {
        const today = new Date();
        const todayString = today.toISOString().split('T')[0];
        let startDate, groupBy = 'day';

        switch (period) {
            case '7days':
                const sevenDaysAgo = new Date(today);
                sevenDaysAgo.setDate(today.getDate() - 6);
                startDate = sevenDaysAgo.toISOString().split('T')[0];
                break;

            case '30days':
                const thirtyDaysAgo = new Date(today);
                thirtyDaysAgo.setDate(today.getDate() - 29);
                startDate = thirtyDaysAgo.toISOString().split('T')[0];
                break;

            case '12months':
                const twelveMonthsAgo = new Date(today);
                twelveMonthsAgo.setMonth(today.getMonth() - 11);
                startDate = twelveMonthsAgo.toISOString().split('T')[0];
                groupBy = 'month';
                break;

            case '1year':
                const oneYearAgo = new Date(today);
                oneYearAgo.setFullYear(today.getFullYear() - 1);
                startDate = oneYearAgo.toISOString().split('T')[0];
                groupBy = 'month';
                break;

            default:
                throw new Error(`Unsupported period: ${period}`);
        }

        return { startDate, endDate: todayString, groupBy };
    }

    /**
     * Format data based on period (daily or monthly grouping)
     */
    static formatDataForPeriod(data, fields, groupBy) {
        if (groupBy === 'day') {
            return this.formatDailyData(data, fields);
        } else if (groupBy === 'month') {
            return this.formatMonthlyData(data, fields);
        }
    }

    /**
     * Format daily data (for 7days, 30days)
     */
    static formatDailyData(data, fields) {
        return data.map(dayData => {
            const formatted = { date: dayData.date };
            
            fields.forEach(field => {
                switch (field) {
                    case 'sleep':
                        formatted.sleep = {
                            totalDuration: dayData.sleep?.duration || 0,
                            entries: dayData.sleep?.entries || []
                        };
                        break;
                    case 'water':
                        formatted.water = {
                            consumed: dayData.water?.consumed || 0,
                            entries: dayData.water?.entries || []
                        };
                        break;
                    case 'steps':
                        formatted.steps = {
                            count: dayData.steps?.count || 0,
                            distance: dayData.steps?.distance || 0
                        };
                        break;
                    case 'calories':
                        formatted.calories = {
                            consumed: dayData.calories?.consumed || 0,
                            burned: dayData.calories?.burned || 0
                        };
                        break;
                }
            });
            
            return formatted;
        });
    }

    /**
     * Format monthly data (for 12months, 1year) - aggregated by month
     */
    static formatMonthlyData(data, fields) {
        const monthlyData = {};
        
        // Group data by month
        data.forEach(dayData => {
            const monthKey = dayData.date.substring(0, 7); // YYYY-MM
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {
                    month: monthKey,
                    days: 0,
                    totals: {}
                };
                
                // Initialize totals for each field
                fields.forEach(field => {
                    monthlyData[monthKey].totals[field] = {
                        total: 0,
                        average: 0,
                        days: 0
                    };
                });
            }
            
            monthlyData[monthKey].days++;
            
            // Aggregate data for each field
            fields.forEach(field => {
                const fieldData = dayData[field];
                if (fieldData) {
                    switch (field) {
                        case 'sleep':
                            if (fieldData.duration) {
                                monthlyData[monthKey].totals.sleep.total += fieldData.duration;
                                monthlyData[monthKey].totals.sleep.days++;
                            }
                            break;
                        case 'water':
                            if (fieldData.consumed) {
                                monthlyData[monthKey].totals.water.total += fieldData.consumed;
                                monthlyData[monthKey].totals.water.days++;
                            }
                            break;
                        case 'steps':
                            if (fieldData.count) {
                                monthlyData[monthKey].totals.steps.total += fieldData.count;
                                monthlyData[monthKey].totals.steps.days++;
                            }
                            break;
                    }
                }
            });
        });
        
        // Calculate averages and format
        return Object.values(monthlyData).map(monthData => {
            fields.forEach(field => {
                const fieldTotal = monthData.totals[field];
                if (fieldTotal.days > 0) {
                    fieldTotal.average = fieldTotal.total / fieldTotal.days;
                }
            });
            return monthData;
        });
    }

    /**
     * Generate summary statistics
     */
    static generateSummary(data, fields, period) {
        const summary = {
            period,
            totalRecords: data.length
        };

        fields.forEach(field => {
            summary[field] = this.calculateFieldSummary(data, field);
        });

        return summary;
    }

    /**
     * Calculate summary for a specific field
     */
    static calculateFieldSummary(data, field) {
        const values = [];
        
        data.forEach(dayData => {
            const fieldData = dayData[field];
            if (fieldData) {
                switch (field) {
                    case 'sleep':
                        if (fieldData.duration) values.push(fieldData.duration);
                        break;
                    case 'water':
                        if (fieldData.consumed) values.push(fieldData.consumed);
                        break;
                    case 'steps':
                        if (fieldData.count) values.push(fieldData.count);
                        break;
                }
            }
        });

        if (values.length === 0) {
            return { total: 0, average: 0, min: 0, max: 0, daysWithData: 0 };
        }

        const total = values.reduce((sum, val) => sum + val, 0);
        const average = total / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);

        return {
            total,
            average: Math.round(average * 100) / 100, // Round to 2 decimals
            min,
            max,
            daysWithData: values.length
        };
    }
}

module.exports = HealthAnalyticsService;