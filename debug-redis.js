// Debug script to check Redis jobs
require('dotenv').config();
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    tls: process.env.REDIS_URL?.includes('rediss://') ? {} : undefined
});

const notificationQueue = new Queue('notificationQueue', { connection });

async function checkJobs() {
    console.log('\n🔍 Checking Redis Queue...\n');

    // Get all job states
    const delayed = await notificationQueue.getJobs(['delayed']);
    const waiting = await notificationQueue.getJobs(['waiting']);
    const active = await notificationQueue.getJobs(['active']);
    const completed = await notificationQueue.getJobs(['completed'], 0, 10);

    console.log(`📊 Job Counts:`);
    console.log(`   Delayed: ${delayed.length}`);
    console.log(`   Waiting: ${waiting.length}`);
    console.log(`   Active: ${active.length}`);
    console.log(`   Completed (last 10): ${completed.length}\n`);

    console.log('📋 Delayed Jobs:');
    for (const job of delayed) {
        const state = await job.getState();
        console.log(`   - ID: ${job.id}`);
        console.log(`     Name: ${job.name}`);
        console.log(`     State: ${state}`);
        console.log(`     Data:`, job.data);
        console.log(`     Delay: ${job.opts.delay}ms (${Math.round(job.opts.delay / 1000 / 60 / 60)} hours)`);
        console.log(`     Next run: ${new Date(Date.now() + job.opts.delay).toISOString()}\n`);
    }

    console.log('📋 Waiting Jobs:');
    for (const job of waiting) {
        console.log(`   - ID: ${job.id}`);
        console.log(`     Name: ${job.name}`);
        console.log(`     Data:`, job.data);
        console.log('');
    }

    console.log('📋 Active Jobs:');
    for (const job of active) {
        console.log(`   - ID: ${job.id}`);
        console.log(`     Name: ${job.name}`);
        console.log(`     Data:`, job.data);
        console.log('');
    }

    await connection.quit();
    process.exit(0);
}

checkJobs().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
