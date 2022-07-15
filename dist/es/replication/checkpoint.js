import { getComposedPrimaryKeyOfDocumentData } from '../rx-schema-helper';
import { stackCheckpoints } from '../rx-storage-helper';
import { createRevision, ensureNotFalsy, fastUnsecureHash, getDefaultRevision, getDefaultRxDocumentMeta, getFromObjectOrThrow, now } from '../util';
import { RX_REPLICATION_META_INSTANCE_SCHEMA } from './meta-instance';

/**
 * Sets the checkpoint,
 * automatically resolves conflicts that appear.
 */
function _settle(pact, state, value) {
  if (!pact.s) {
    if (value instanceof _Pact) {
      if (value.s) {
        if (state & 1) {
          state = value.s;
        }

        value = value.v;
      } else {
        value.o = _settle.bind(null, pact, state);
        return;
      }
    }

    if (value && value.then) {
      value.then(_settle.bind(null, pact, state), _settle.bind(null, pact, 2));
      return;
    }

    pact.s = state;
    pact.v = value;
    const observer = pact.o;

    if (observer) {
      observer(pact);
    }
  }
}

var _Pact = /*#__PURE__*/function () {
  function _Pact() {}

  _Pact.prototype.then = function (onFulfilled, onRejected) {
    var result = new _Pact();
    var state = this.s;

    if (state) {
      var callback = state & 1 ? onFulfilled : onRejected;

      if (callback) {
        try {
          _settle(result, 1, callback(this.v));
        } catch (e) {
          _settle(result, 2, e);
        }

        return result;
      } else {
        return this;
      }
    }

    this.o = function (_this) {
      try {
        var value = _this.v;

        if (_this.s & 1) {
          _settle(result, 1, onFulfilled ? onFulfilled(value) : value);
        } else if (onRejected) {
          _settle(result, 1, onRejected(value));
        } else {
          _settle(result, 2, value);
        }
      } catch (e) {
        _settle(result, 2, e);
      }
    };

    return result;
  };

  return _Pact;
}();

function _isSettledPact(thenable) {
  return thenable instanceof _Pact && thenable.s & 1;
}

function _for(test, update, body) {
  var stage;

  for (;;) {
    var shouldContinue = test();

    if (_isSettledPact(shouldContinue)) {
      shouldContinue = shouldContinue.v;
    }

    if (!shouldContinue) {
      return result;
    }

    if (shouldContinue.then) {
      stage = 0;
      break;
    }

    var result = body();

    if (result && result.then) {
      if (_isSettledPact(result)) {
        result = result.s;
      } else {
        stage = 1;
        break;
      }
    }

    if (update) {
      var updateValue = update();

      if (updateValue && updateValue.then && !_isSettledPact(updateValue)) {
        stage = 2;
        break;
      }
    }
  }

  var pact = new _Pact();

  var reject = _settle.bind(null, pact, 2);

  (stage === 0 ? shouldContinue.then(_resumeAfterTest) : stage === 1 ? result.then(_resumeAfterBody) : updateValue.then(_resumeAfterUpdate)).then(void 0, reject);
  return pact;

  function _resumeAfterBody(value) {
    result = value;

    do {
      if (update) {
        updateValue = update();

        if (updateValue && updateValue.then && !_isSettledPact(updateValue)) {
          updateValue.then(_resumeAfterUpdate).then(void 0, reject);
          return;
        }
      }

      shouldContinue = test();

      if (!shouldContinue || _isSettledPact(shouldContinue) && !shouldContinue.v) {
        _settle(pact, 1, result);

        return;
      }

      if (shouldContinue.then) {
        shouldContinue.then(_resumeAfterTest).then(void 0, reject);
        return;
      }

      result = body();

      if (_isSettledPact(result)) {
        result = result.v;
      }
    } while (!result || !result.then);

    result.then(_resumeAfterBody).then(void 0, reject);
  }

  function _resumeAfterTest(shouldContinue) {
    if (shouldContinue) {
      result = body();

      if (result && result.then) {
        result.then(_resumeAfterBody).then(void 0, reject);
      } else {
        _resumeAfterBody(result);
      }
    } else {
      _settle(pact, 1, result);
    }
  }

  function _resumeAfterUpdate() {
    if (shouldContinue = test()) {
      if (shouldContinue.then) {
        shouldContinue.then(_resumeAfterTest).then(void 0, reject);
      } else {
        _resumeAfterTest(shouldContinue);
      }
    } else {
      _settle(pact, 1, result);
    }
  }
}

export var setCheckpoint = function setCheckpoint(state, direction, checkpoint) {
  try {
    var _exit2 = false;
    var previousCheckpointDoc = state.lastCheckpointDoc[direction];
    return Promise.resolve(function () {
      if (checkpoint &&
      /**
       * If the replication is already canceled,
       * we do not write a checkpoint
       * because that could mean we write a checkpoint
       * for data that has been fetched from the master
       * but not been written to the child.
       */
      !state.events.canceled.getValue() && (
      /**
       * Only write checkpoint if it is different from before
       * to have less writes to the storage.
       */
      !previousCheckpointDoc || JSON.stringify(previousCheckpointDoc.data) !== JSON.stringify(checkpoint))) {
        var newDoc = {
          id: '',
          isCheckpoint: '1',
          itemId: direction,
          replicationIdentifier: state.checkpointKey,
          _deleted: false,
          _attachments: {},
          data: checkpoint,
          _meta: getDefaultRxDocumentMeta(),
          _rev: getDefaultRevision()
        };
        newDoc.id = getComposedPrimaryKeyOfDocumentData(RX_REPLICATION_META_INSTANCE_SCHEMA, newDoc);
        return _for(function () {
          return !_exit2;
        }, void 0, function () {
          /**
           * Instead of just storign the new checkpoint,
           * we have to stack up the checkpoint with the previous one.
           * This is required for plugins like the sharding RxStorage
           * where the changeStream events only contain a Partial of the
           * checkpoint.
           */
          if (previousCheckpointDoc) {
            newDoc.data = stackCheckpoints([previousCheckpointDoc.data, newDoc.data]);
          }

          newDoc._meta.lwt = now();
          newDoc._rev = createRevision(newDoc, previousCheckpointDoc);
          return Promise.resolve(state.input.metaInstance.bulkWrite([{
            previous: previousCheckpointDoc,
            document: newDoc
          }], 'replication-set-checkpoint')).then(function (result) {
            if (result.success[newDoc.id]) {
              state.lastCheckpointDoc[direction] = getFromObjectOrThrow(result.success, newDoc.id);
              _exit2 = true;
            } else {
              var error = getFromObjectOrThrow(result.error, newDoc.id);

              if (error.status !== 409) {
                throw error;
              } else {
                previousCheckpointDoc = ensureNotFalsy(error.documentInDb);
                newDoc._rev = createRevision(newDoc, previousCheckpointDoc);
              }
            }
          });
        });
      }
    }());
  } catch (e) {
    return Promise.reject(e);
  }
};
export var getLastCheckpointDoc = function getLastCheckpointDoc(state, direction) {
  try {
    var checkpointDocId = getComposedPrimaryKeyOfDocumentData(RX_REPLICATION_META_INSTANCE_SCHEMA, {
      isCheckpoint: '1',
      itemId: direction,
      replicationIdentifier: state.checkpointKey
    });
    return Promise.resolve(state.input.metaInstance.findDocumentsById([checkpointDocId], false)).then(function (checkpointResult) {
      var checkpointDoc = checkpointResult[checkpointDocId];
      state.lastCheckpointDoc[direction] = checkpointDoc;

      if (checkpointDoc) {
        return checkpointDoc.data;
      } else {
        return undefined;
      }
    });
  } catch (e) {
    return Promise.reject(e);
  }
};
export function getCheckpointKey(input) {
  var hash = fastUnsecureHash([input.identifier, input.forkInstance.storage.name, input.forkInstance.databaseName, input.forkInstance.collectionName].join('||'));
  return 'rx-storage-replication-' + hash;
}
//# sourceMappingURL=checkpoint.js.map