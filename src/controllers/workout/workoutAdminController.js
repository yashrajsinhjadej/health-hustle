const ResponseHandler = require('../../utils/responseHandler');
const workoutModel = require('../../models/Workout')

class WorkoutAdminController {

    async createWorkout(req,res){
     try{
        const workoutData = req.body;

        workoutData.videos=[]
        workoutData.createdBy = req.user._id;


        // adding sequence if not present in the body 
        if(workoutData.sequence===undefined){
            const lastWorkout = await workoutModel.findOne().sort({ sequence: -1 });
            workoutData.sequence = lastWorkout ? lastWorkout.sequence + 1 : 1;
        }
        
        // if the sequence is present in the body then we need to rearrange the db sequences
        else{
            const existingWorkout = await workoutModel.findOne({ sequence: workoutData.sequence });
            if (existingWorkout) {
                // Increment sequence of workouts with sequence >= new workout's sequence
                await workoutModel.updateMany(
                    { sequence: { $gte: workoutData.sequence } },
                    { $inc: { sequence: 1 } }
                );
            }
        }

        

        const data = await workoutModel.create(workoutData);
        return ResponseHandler.success(res,'Workout created successfully',data);
     }
     catch(error){
         if (error.code === 11000 && error.keyPattern && error.keyPattern.name) {
        return ResponseHandler.error(res, 'Workout name already exists');
    }
         return ResponseHandler.error(res, error);
    }

    }
}
module.exports = new WorkoutAdminController();