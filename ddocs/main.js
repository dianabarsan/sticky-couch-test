module.exports = {
  _id: '_design/main',
  views: {
    main: {
      map: 'function(doc) { emit(doc.value); }',
    },
    by_id: {
      map: 'function(doc) { emit([doc._id], { _id: doc._id }); }',
    }
  }
};
