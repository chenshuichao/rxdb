import { getFromMapOrFill, getFromMapOrThrow, parseRevision } from './util';
import { overwritable } from './overwritable';
import { getDocumentDataOfRxChangeEvent } from './rx-change-event';
/**
 * The DocumentCache stores RxDocument objects
 * by their primary key and revision.
 * This is useful on client side applications where
 * it is not known how much memory can be used, so
 * we de-duplicate RxDocument states to save memory.
 * To not fill up the memory with old document states, the DocumentCache
 * only contains weak references to the RxDocuments themself.
 * @link https://caniuse.com/?search=weakref
 */
export var DocumentCache = /*#__PURE__*/function () {
  /**
   * Some JavaScript runtimes like QuickJS,
   * so not have a FinalizationRegistry or WeakRef.
   * Therefore we need a workaround which might waste a lot of memory,
   * but at least works.
   */

  function DocumentCache(primaryPath, changes$,
  /**
   * A method that can create a RxDocument by the given document data.
   */
  documentCreator) {
    var _this = this;
    this.cacheItemByDocId = new Map();
    this.registry = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry(function (docMeta) {
      var docId = docMeta.docId;
      var cacheItem = _this.cacheItemByDocId.get(docId);
      if (cacheItem) {
        cacheItem.documentByRevisionHeight["delete"](docMeta.revisionHeight);
        if (cacheItem.documentByRevisionHeight.size === 0) {
          /**
           * No state of the document is cached anymore,
           * so we can clean up.
           */
          _this.cacheItemByDocId["delete"](docId);
        }
      }
    }) : undefined;
    this.primaryPath = primaryPath;
    this.changes$ = changes$;
    this.documentCreator = documentCreator;
    changes$.subscribe(function (changeEvent) {
      var docId = changeEvent.documentId;
      var cacheItem = _this.cacheItemByDocId.get(docId);
      if (cacheItem) {
        var documentData = getDocumentDataOfRxChangeEvent(changeEvent);
        cacheItem.latestDoc = documentData;
      }
    });
  }

  /**
   * Get the RxDocument from the cache
   * and create a new one if not exits before.
   */
  var _proto = DocumentCache.prototype;
  _proto.getCachedRxDocument = function getCachedRxDocument(docData) {
    var docId = docData[this.primaryPath];
    var revisionHeight = parseRevision(docData._rev).height;
    var cacheItem = getFromMapOrFill(this.cacheItemByDocId, docId, function () {
      return getNewCacheItem(docData);
    });
    var cachedRxDocumentWeakRef = cacheItem.documentByRevisionHeight.get(revisionHeight);
    var cachedRxDocument = cachedRxDocumentWeakRef ? cachedRxDocumentWeakRef.deref() : undefined;
    if (!cachedRxDocument) {
      docData = overwritable.deepFreezeWhenDevMode(docData);
      cachedRxDocument = this.documentCreator(docData);
      cacheItem.documentByRevisionHeight.set(revisionHeight, createWeakRefWithFallback(cachedRxDocument));
      if (this.registry) {
        this.registry.register(cachedRxDocument, {
          docId: docId,
          revisionHeight: revisionHeight
        });
      }
    }
    return cachedRxDocument;
  }

  /**
   * Throws if not exists
   */;
  _proto.getLatestDocumentData = function getLatestDocumentData(docId) {
    var cacheItem = getFromMapOrThrow(this.cacheItemByDocId, docId);
    return cacheItem.latestDoc;
  };
  _proto.getLatestDocumentDataIfExists = function getLatestDocumentDataIfExists(docId) {
    var cacheItem = this.cacheItemByDocId.get(docId);
    if (cacheItem) {
      return cacheItem.latestDoc;
    }
  };
  return DocumentCache;
}();
function getNewCacheItem(docData) {
  return {
    documentByRevisionHeight: new Map(),
    latestDoc: docData
  };
}

/**
 * Fallback for JavaScript runtimes that do not support WeakRef.
 * The fallback will keep the items in cache forever,
 * but at least works.
 */
var HAS_WEAK_REF = typeof WeakRef === 'function';
function createWeakRefWithFallback(obj) {
  if (HAS_WEAK_REF) {
    return new WeakRef(obj);
  } else {
    return {
      deref: function deref() {
        return obj;
      }
    };
  }
}
//# sourceMappingURL=doc-cache.js.map