import mongoose from 'mongoose';

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

export const Reimbursement = mongoose.model('Reimbursement', new Schema({
  user: ObjectId,
  status: String,
  payrollRun: ObjectId,
  category: String,
  amount: Number,
}));
