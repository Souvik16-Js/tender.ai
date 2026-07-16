const mongoose = require('mongoose');
const DocumentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  }
});
const TenderSchema = new mongoose.Schema({
  tenderId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  referenceNumber: {
    type: String,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  organization: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  department: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['Goods', 'Works', 'Services', 'Others'],
    default: 'Others',
    index: true
  },
  estimatedValue: {
    type: Number,
    default: 0,
    index: true
  },
  emd: {
    type: Number,
    default: 0
  },
  tenderFee: {
    type: Number,
    default: 0
  },
  publishDate: {
    type: Date,
    index: true
  },
  bidSubmissionStartDate: {
    type: Date
  },
  bidSubmissionEndDate: {
    type: Date,
    index: true
  },
  bidOpeningDate: {
    type: Date
  },
  documentUrls: [DocumentSchema],
  status: {
    type: String,
    enum: ['Active', 'Cancelled', 'Awarded', 'Archived'],
    default: 'Active',
    index: true
  },
  source: {
    type: String,
    required: true,
    enum: ['Assam Tenders', 'GeM'],
    index: true
  },
  rawScrapedData: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});
// Create text index for full-text search
TenderSchema.index({
  title: 'text',
  description: 'text',
  organization: 'text',
  referenceNumber: 'text'
}, {
  weights: {
    title: 10,
    organization: 5,
    referenceNumber: 3,
    description: 1
  },
  name: 'TenderTextIndex'
});
module.exports = mongoose.model('Tender', TenderSchema);
