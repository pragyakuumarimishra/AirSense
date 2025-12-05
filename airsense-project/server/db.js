const mongoose = require('mongoose');

async function connect(uri) {
  if (!uri) throw new Error('Missing MONGODB_URI');
  await mongoose.connect(uri, { autoIndex: true });
  return mongoose;
}

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true });

const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  city: { type: String, default: 'Unknown' },
  sensitivity: { type: String, enum: ['low','medium','high'], default: 'medium' },
  conditions: { type: [String], default: [] }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Profile = mongoose.model('Profile', profileSchema);

module.exports = { connect, User, Profile };
