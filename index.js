const express = require('express');
const cors = require('cors');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 7000;

// middleWares
app.use(cors());
app.use(express.json());

// Database Connection
const uri = process.env.DB_URI;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1,
});



// function verifyJWT(req, res, next) {
//     const authHeader = req.headers.authorization;
//     if (!authHeader) {
//         return res.status(401).send('unauthorized access');
//     }

//     const token = authHeader.split(' ')[1];

//     jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
//         if (err) {
//             return res.status(403).send({ message: 'forbidden access' });
//         }
//         req.decoded = decoded;
//         next();
//     });
// }






async function run() {
    try {
        const catagoriesCollection = client
            .db('uselap-db')
            .collection('catagories');
        const usersCollection = client.db('uselap-db').collection('users');
        const productsCollection = client
            .db('uselap-db')
            .collection('products');
        const bookingsCollection = client
            .db('uselap-db')
            .collection('bookings');
        const paymentCollection = client.db('uselap-db').collection('payment');

        // jwt for sign up and login
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
                    expiresIn: '1h',
                });
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' });
        });

        // home categories show
        app.get('/category', async (req, res) => {
            const result = await catagoriesCollection.find({}).toArray();
            res.send(result);
        });

        // seller my product
        app.get('/products', async (req, res) => {
            const result = await productsCollection.find({}).toArray();
            res.send(result);
        });

        // get category products
        app.get('/categories-data/:category', async (req, res) => {
            const category = req.params.category;
            const query = {
                $and: [{ category: category }, { status: 'available' }],
            };
            const result = await productsCollection.find(query).toArray();
            res.send(result);
            // console.log(result);
        });

        // check role
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await usersCollection.findOne(query);
            res.send(result);
            // console.log(result)
        });

        app.put('/users/verified/:id', async (req, res) => {
            // const decodedEmail = req.decoded.email;
            // const query = { email: decodedEmail };
            // const user = await usersCollection.findOne(query);
            // if (user?.role !== 'admin') {
            //     return res.status(403).send({ message: 'forbidden access' });
            // }
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    checked: 'verified',
                },
            };

            const result = await usersCollection.updateOne(
                filter,
                updatedDoc,
                options,
            );
            res.send(result);
        });

        app.get('/users', async (req, res) => {
            const result = await usersCollection.find({}).toArray();
            res.send(result);
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const users = await usersCollection.insertOne(user);
            res.send(users);
        });

        app.post('/products', async (req, res) => {
            const product = req.body;
            const products = await productsCollection.insertOne(product);
            res.send(products);
        });

        app.get('/products/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await productsCollection.find(query).toArray();
            res.send(result);
            // console.log(result);
        });

        app.patch('/report-item/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    report: 'true',
                },
            };
            const result = await productsCollection.updateOne(
                filter,
                updateDoc,
                options,
            );
            res.send(result);
        });

        app.get('/report-item', async (req, res) => {
            const report = req.query.report;
            const filter = { report: report };
            const result = await productsCollection.find(filter).toArray();
            res.send(result);
        });

        app.delete('/reportItem/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await productsCollection.deleteOne(query);
            res.send(result);
        });

        app.patch('/advertise/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            // const updateDoc = {
            //     $set: {
            //         advertise: true,
            //     },
            // };
            const result = await productsCollection.updateOne(
                filter,
                {
                    $set: req.body,
                },
                options,
            );
            // console.log(result);
            res.send(result);
        });

        app.get('/advertise', async (req, res) => {
            const filter = { advertise: true };
            const result = await productsCollection
                .find(filter)
                .sort({ $natural: -1 })
                .toArray();
            res.send(result);
        });

        app.post('/bookings', async (req, res) => {
            const product = req.body;
            const products = await bookingsCollection.insertOne(product);
            res.send(products);
        });

        app.get('/bookings/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            // console.log(query);
            const result = await bookingsCollection.find(query).toArray();
            res.send(result);
        });

        // payment ==================================
        app.get('/booking/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const query = { _id: ObjectId(id) };
            const booking = await bookingsCollection.findOne(query);
            res.send(booking);
        });

        app.post('/create-payment-intent', async (req, res) => {
            const payment = req.body;
            const price = payment.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: ['card'],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);
            const id = payment.bookingId;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transitionId: payment.transitionId,
                },
            };
            const updatedResult = await bookingsCollection.updateOne(
                filter,
                updatedDoc,
            );

            const productId = req.body.productId;
            const query = { _id: ObjectId(productId) };
            const updatedProduct = {
                $set: {
                    status: 'sold',
                    advertise: false,
                },
            };
            const updatedProductResult = await productsCollection.updateOne(
                query,
                updatedProduct,
            );

            res.send(result, updatedProductResult, updatedResult);
        });

        // ================
        app.delete('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await bookingsCollection.deleteOne(query);
            res.send(result);
        });

        app.delete('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await productsCollection.deleteOne(query);
            res.send(result);
        });

        app.get('/buyers', async (req, res) => {
            const filter = { role: 'Buyer' };
            const result = await usersCollection.find(filter).toArray();
            res.send(result);
        });

        app.delete('/buyers/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        });
        app.get('/sellers', async (req, res) => {
            const filter = { role: 'Seller' };
            const result = await usersCollection.find(filter).toArray();
            res.send(result);
        });

        app.delete('/sellers/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        });

        app.get('/allProducts', async (req, res) => {
            const result = await productsCollection.find({}).toArray();
            res.send(result);
        });

        app.delete('/allProducts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await productsCollection.deleteOne(query);
            res.send(result);
        });

        console.log('Database Connected...');
    } finally {
    }
}

run().catch((err) => console.error(err));

app.get('/', (req, res) => {
    res.send('Server is running... in session');
});

app.listen(port, () => {
    console.log(`Server is running...on ${port}`);
});
