export async function dropAllCollections(db) {
  const collections = await db.collections();
  await Promise.all(collections.map(col => {
    console.log(`Dropping collection ${col.collectionName}`);
    return db.dropCollection(col.collectionName);
  }));
}

export function upsertItemById(collection, item) {
  return collection.replaceOne({ _id: item._id }, item, { upsert: true });
}
