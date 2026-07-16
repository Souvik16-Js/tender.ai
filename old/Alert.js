const mongoose = require('mongoose');
const AlertSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  keywords: [{
    type: String,
    trim: true
  }],
  minVal: {
    type: Number,
    default: 0
  },
  maxVal: {
    type: Number
  },
  categories: [{
    type: String,
    enum: ['Goods', 'Works', 'Services', 'Others']
  }],
  sources: [{
    type: String,
    enum: ['Assam Tenders', 'GeM']
  }],
  lastTriggered: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});
module.exports = mongoose.model('Alert', AlertSchema);
