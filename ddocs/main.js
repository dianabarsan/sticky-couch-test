module.exports = {
  _id: '_design/main',
  views: {
    main: {
      map: 'function(doc) { emit(doc.value); }',
    }
  }
};
