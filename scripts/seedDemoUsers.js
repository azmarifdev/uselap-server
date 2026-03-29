require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.DB_URI;

if (!uri) {
    console.error('DB_URI is missing in .env');
    process.exit(1);
}

const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1,
});

const demoUsers = [
    {
        name: 'Demo Seller',
        email: 'seller@gmail.com',
        role: 'Seller',
        demoAccount: true,
    },
    {
        name: 'Demo Buyer',
        email: 'buyer@gmail.com',
        role: 'Buyer',
        demoAccount: true,
    },
    {
        name: 'Demo Admin',
        email: 'admin@gmail.com',
        role: 'Admin',
        demoAccount: true,
    },
];

async function seedDemoUsers() {
    try {
        const usersCollection = client.db('uselap-db').collection('users');

        for (const user of demoUsers) {
            await usersCollection.updateOne(
                { email: user.email },
                { $set: user },
                { upsert: true },
            );
        }

        console.log('Demo users seeded successfully.');
    } catch (error) {
        console.error('Failed to seed demo users:', error.message);
        process.exit(1);
    } finally {
        await client.close();
    }
}

seedDemoUsers();
