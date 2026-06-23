import mongoose from 'mongoose';

const urlCategorySchema = new mongoose.Schema({
  pattern:  { type: String, required: true, unique: true, trim: true },
  category: { type: String, enum: ['productive', 'neutral', 'non-productive'], required: true },
  label:    { type: String, default: '' },
});

export const UrlCategory = mongoose.model('UrlCategory', urlCategorySchema);
