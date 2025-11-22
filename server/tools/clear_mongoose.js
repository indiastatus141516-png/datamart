// Run with: node tools/clear_mongoose.js
// WARNING: This will drop ALL collections in your MongoDB database!
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  const mongo = process.env.MONGO_URI || 'mongodb://localhost:27017/crm';
  await mongoose.connect(mongo, { useNewUrlParser: true, useUnifiedTopology: true });
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const col of collections) {
    await mongoose.connection.db.dropCollection(col.name);
    console.log('Dropped collection:', col.name);
  }
  await mongoose.disconnect();
  console.log('All collections dropped. Database is now empty.');
}

run().catch(err => { console.error(err); process.exit(1); });
