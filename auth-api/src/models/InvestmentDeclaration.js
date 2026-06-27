import mongoose from 'mongoose';

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

export const InvestmentDeclaration = mongoose.model('InvestmentDeclaration', new Schema({
  user: ObjectId,
  financialYear: String,
  regime: String,
  items: [{ section: String, declaredAmount: Number }],
}));
