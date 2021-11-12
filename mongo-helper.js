async function dropAllCollections(db) {
  const collections = await db.collections();
  await Promise.all(collections.map(col => db.dropCollection(col.s.name)));
}

function deleteAllItems(collection) {
  return collection.deleteMany({});
}

function upsertItemById(collection, item) {
  return collection.replaceOne({ _id: item._id }, item, { upsert: true });
}

module.exports = {
  dropAllCollections,
  deleteAllItems,
  upsertItemById
};
