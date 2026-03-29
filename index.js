const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const requiredEnv = ['DB_URI', 'ACCESS_TOKEN', 'STRIPE_SECRET'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
    console.error(`Missing required env: ${missingEnv.join(', ')}`);
    process.exit(1);
}

const stripe = require('stripe')(process.env.STRIPE_SECRET);
const app = express();
const port = process.env.PORT || 7000;
const dbName = process.env.DB_NAME || 'uselap-db';
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const allowAnyOrigin = !isProduction && allowedOrigins.length === 0;

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        if (allowAnyOrigin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200,
};

app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());
app.use(cors(corsOptions));
app.use(express.json({ limit: process.env.BODY_LIMIT || '1mb' }));
app.use(
    rateLimit({
        windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
        max: Number(process.env.RATE_LIMIT_MAX || 300),
        standardHeaders: true,
        legacyHeaders: false,
    }),
);

// Database Connection
const uri = process.env.DB_URI;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1,
});

function parseObjectId(id) {
    if (!ObjectId.isValid(id)) {
        return null;
    }
    return new ObjectId(id);
}

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' });
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
        return res.status(401).send({ message: 'invalid authorization header' });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' });
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        const catagoriesCollection = client
            .db(dbName)
            .collection('catagories');
        const usersCollection = client.db(dbName).collection('users');
        const productsCollection = client
            .db(dbName)
            .collection('products');
        const bookingsCollection = client
            .db(dbName)
            .collection('bookings');
        const paymentCollection = client.db(dbName).collection('payment');

        // jwt for sign up and login
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                return res.status(400).send({ message: 'email is required' });
            }
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
            const userEmail = req.params.email;
            const query = { email: userEmail };
            const result = await usersCollection.findOne(query);
            res.send(result);
            // console.log(result)
        });
        // app.put('/users/verified/:id', async (req, res) => {

        //     const id = req.params.id;
        //     const filter = { _id: ObjectId(id) };
        //     const options = { upsert: true };
        //     const updatedDoc = {
        //         $set: {
        //             checked: 'verified',
        //         },
        //     };

        //     const result = await usersCollection.updateOne(
        //         filter,
        //         updatedDoc,
        //         options,
        //     );
        //     res.send(result);
        // });

        app.get('/users', verifyJWT, async (req, res) => {
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

        app.get('/products/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            // console.log(req.headers.authorization);

            // decoded from jwt sign login signup function (jwt2)
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const query = { email: email };
            const result = await productsCollection.find(query).toArray();
            res.send(result);
            // console.log(result);
        });

        app.patch('/report-item/:id', async (req, res) => {
            const id = req.params.id;
            const objectId = parseObjectId(id);
            if (!objectId) {
                return res.status(400).send({ message: 'invalid id' });
            }
            const filter = { _id: objectId };
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

        app.get('/report-item', verifyJWT, async (req, res) => {
            const report = req.query.report;
            const filter = { report: report };
            const result = await productsCollection.find(filter).toArray();
            res.send(result);
        });

        app.delete('/reportItem/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const objectId = parseObjectId(id);
            if (!objectId) {
                return res.status(400).send({ message: 'invalid id' });
            }
            const query = { _id: objectId };
            const result = await productsCollection.deleteOne(query);
            res.send(result);
        });

        app.patch('/advertise/:id', async (req, res) => {
            const id = req.params.id;
            const objectId = parseObjectId(id);
            if (!objectId) {
                return res.status(400).send({ message: 'invalid id' });
            }
            const filter = { _id: objectId };
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

        app.post('/bookings', verifyJWT, async (req, res) => {
            const product = req.body;
            if (!product?.email || product.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const products = await bookingsCollection.insertOne(product);
            res.send(products);
        });

        app.get('/bookings/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const query = { email: email };
            // console.log(query);
            const result = await bookingsCollection.find(query).toArray();
            res.send(result);
        });

        // payment ==================================
        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const objectId = parseObjectId(id);
            if (!objectId) {
                return res.status(400).send({ message: 'invalid id' });
            }
            const query = { _id: objectId };
            const booking = await bookingsCollection.findOne(query);
            if (!booking) {
                return res.status(404).send({ message: 'booking not found' });
            }
            if (booking.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            res.send(booking);
        });

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const payment = req.body;
            const price = Number(payment.price);
            if (!Number.isFinite(price) || price <= 0) {
                return res.status(400).send({ message: 'invalid price' });
            }
            const amount = Math.round(price * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: ['card'],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            if (!payment?.email || payment.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const bookingId = parseObjectId(payment.bookingId);
            const productId = parseObjectId(payment.productId);
            if (!bookingId || !productId) {
                return res.status(400).send({ message: 'invalid booking/product id' });
            }
            const result = await paymentCollection.insertOne(payment);
            const filter = { _id: bookingId };
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

            const query = { _id: productId };
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

            res.send({
                acknowledged: result.acknowledged,
                paymentId: result.insertedId,
                bookingUpdated: updatedResult.modifiedCount > 0,
                productUpdated: updatedProductResult.modifiedCount > 0,
            });
        });

        // ================
        app.delete('/bookings/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const objectId = parseObjectId(id);
            if (!objectId) {
                return res.status(400).send({ message: 'invalid id' });
            }
            const query = { _id: objectId };
            const booking = await bookingsCollection.findOne(query);
            if (!booking) {
                return res.status(404).send({ message: 'booking not found' });
            }
            if (booking.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const result = await bookingsCollection.deleteOne(query);
            res.send(result);
        });

        app.delete('/products/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const objectId = parseObjectId(id);
            if (!objectId) {
                return res.status(400).send({ message: 'invalid id' });
            }
            const query = { _id: objectId };
            const product = await productsCollection.findOne(query);
            if (!product) {
                return res.status(404).send({ message: 'product not found' });
            }
            if (product.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const result = await productsCollection.deleteOne(query);
            res.send(result);
        });

        app.get('/buyers', verifyJWT, async (req, res) => {
            const filter = { role: 'Buyer' };
            const result = await usersCollection.find(filter).toArray();
            res.send(result);
        });

        app.delete('/buyers/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const objectId = parseObjectId(id);
            if (!objectId) {
                return res.status(400).send({ message: 'invalid id' });
            }
            const query = { _id: objectId };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        });
        app.get('/sellers', verifyJWT, async (req, res) => {
            const filter = { role: 'Seller' };
            const result = await usersCollection.find(filter).toArray();
            res.send(result);
        });

        app.delete('/sellers/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const objectId = parseObjectId(id);
            if (!objectId) {
                return res.status(400).send({ message: 'invalid id' });
            }
            const query = { _id: objectId };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        });

        app.get('/allProducts', verifyJWT, async (req, res) => {
            const result = await productsCollection.find({}).toArray();
            res.send(result);
        });

        // public product listing for marketplace page
        app.get('/products-public', async (req, res) => {
            const result = await productsCollection
                .find({})
                .sort({ _id: -1 })
                .toArray();
            res.send(result);
        });

        // single product for product view page
        app.get('/products-public/:id', async (req, res) => {
            const id = req.params.id;
            const objectId = parseObjectId(id);
            if (!objectId) {
                return res.status(400).send({ message: 'invalid product id' });
            }
            const result = await productsCollection.findOne({
                _id: objectId,
            });
            if (!result) {
                return res.status(404).send({ message: 'product not found' });
            }
            res.send(result);
        });

        app.delete('/allProducts/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const objectId = parseObjectId(id);
            if (!objectId) {
                return res.status(400).send({ message: 'invalid id' });
            }
            const query = { _id: objectId };
            const result = await productsCollection.deleteOne(query);
            res.send(result);
        });

        console.log('Database Connected...');
    } finally {
    }
}

run().catch((err) => console.error(err));

app.get('/health', (req, res) => {
    res.status(200).send({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

app.get('/', (req, res) => {
    res.send('Server is running... in session');
});

app.use((req, res) => {
    res.status(404).send({ message: 'route not found' });
});

app.use((error, req, res, next) => {
    if (error.message === 'Not allowed by CORS') {
        return res.status(403).send({ message: 'cors blocked for this origin' });
    }

    console.error(error);
    res.status(500).send({ message: 'internal server error' });
});

app.listen(port, () => {
    console.log(`Server is running...on ${port}`);
});
