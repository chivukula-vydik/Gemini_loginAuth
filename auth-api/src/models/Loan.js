import mongoose from 'mongoose';

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

export const Loan = mongoose.model('Loan', new Schema({
  user: ObjectId,
  schedule: [{ period: { month: Number, year: Number }, amount: Number, status: String }],
  status: String,
}));
