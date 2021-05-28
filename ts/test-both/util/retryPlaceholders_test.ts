// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  getOneHourAgo,
  RetryItemType,
  RetryPlaceholders,
  STORAGE_KEY,
} from '../../util/retryPlaceholders';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('RetryPlaceholders', () => {
  beforeEach(() => {
    window.storage.put(STORAGE_KEY, null);
  });

  function getDefaultItem(): RetryItemType {
    return {
      conversationId: 'conversation-id',
      sentAt: Date.now() - 10,
      receivedAt: Date.now() - 5,
      receivedAtCounter: 4,
      senderUuid: 'sender-uuid',
    };
  }

  describe('constructor', () => {
    it('loads previously-saved data on creation', () => {
      const items: Array<RetryItemType> = [
        getDefaultItem(),
        { ...getDefaultItem(), conversationId: 'conversation-id-2' },
      ];
      window.storage.put(STORAGE_KEY, items);

      const placeholders = new RetryPlaceholders();

      assert.strictEqual(2, placeholders.getCount());
    });
    it('starts with no data if provided data fails to parse', () => {
      window.storage.put(STORAGE_KEY, [
        { item: 'is wrong shape!' },
        { bad: 'is not good!' },
      ]);

      const placeholders = new RetryPlaceholders();

      assert.strictEqual(0, placeholders.getCount());
    });
  });

  describe('#add', () => {
    it('adds one item', async () => {
      const placeholders = new RetryPlaceholders();
      await placeholders.add(getDefaultItem());
      assert.strictEqual(1, placeholders.getCount());
    });

    it('throws if provided data fails to parse', () => {
      const placeholders = new RetryPlaceholders();
      assert.isRejected(
        placeholders.add({
          item: 'is wrong shape!',
        } as any),
        'Item did not match schema'
      );
    });
  });

  describe('#getNextToExpire', () => {
    it('returns nothing if no items', () => {
      const placeholders = new RetryPlaceholders();
      assert.strictEqual(0, placeholders.getCount());
      assert.isUndefined(placeholders.getNextToExpire());
    });
    it('returns only item if just one item', () => {
      const item = getDefaultItem();
      const items: Array<RetryItemType> = [item];
      window.storage.put(STORAGE_KEY, items);

      const placeholders = new RetryPlaceholders();
      assert.strictEqual(1, placeholders.getCount());
      assert.deepEqual(item, placeholders.getNextToExpire());
    });
    it('returns soonest expiration given a list, and after add', async () => {
      const older = {
        ...getDefaultItem(),
        receivedAt: Date.now(),
      };
      const newer = {
        ...getDefaultItem(),
        receivedAt: Date.now() + 10,
      };
      const items: Array<RetryItemType> = [older, newer];
      window.storage.put(STORAGE_KEY, items);

      const placeholders = new RetryPlaceholders();
      assert.strictEqual(2, placeholders.getCount());
      assert.deepEqual(older, placeholders.getNextToExpire());

      const oldest = {
        ...getDefaultItem(),
        receivedAt: Date.now() - 5,
      };

      await placeholders.add(oldest);
      assert.strictEqual(3, placeholders.getCount());
      assert.deepEqual(oldest, placeholders.getNextToExpire());
    });
  });

  describe('#getExpiredAndRemove', () => {
    it('does nothing if no item expired', async () => {
      const older = {
        ...getDefaultItem(),
        receivedAt: Date.now() + 10,
      };
      const newer = {
        ...getDefaultItem(),
        receivedAt: Date.now() + 15,
      };
      const items: Array<RetryItemType> = [older, newer];
      window.storage.put(STORAGE_KEY, items);

      const placeholders = new RetryPlaceholders();
      assert.strictEqual(2, placeholders.getCount());
      assert.deepEqual([], await placeholders.getExpiredAndRemove());
      assert.strictEqual(2, placeholders.getCount());
    });
    it('removes just one if expired', async () => {
      const older = {
        ...getDefaultItem(),
        receivedAt: getOneHourAgo() - 1000,
      };
      const newer = {
        ...getDefaultItem(),
        receivedAt: Date.now() + 15,
      };
      const items: Array<RetryItemType> = [older, newer];
      window.storage.put(STORAGE_KEY, items);

      const placeholders = new RetryPlaceholders();
      assert.strictEqual(2, placeholders.getCount());
      assert.deepEqual([older], await placeholders.getExpiredAndRemove());
      assert.strictEqual(1, placeholders.getCount());
      assert.deepEqual(newer, placeholders.getNextToExpire());
    });
    it('removes all if expired', async () => {
      const older = {
        ...getDefaultItem(),
        receivedAt: getOneHourAgo() - 1000,
      };
      const newer = {
        ...getDefaultItem(),
        receivedAt: getOneHourAgo() - 900,
      };
      const items: Array<RetryItemType> = [older, newer];
      window.storage.put(STORAGE_KEY, items);

      const placeholders = new RetryPlaceholders();
      assert.strictEqual(2, placeholders.getCount());
      assert.deepEqual(
        [older, newer],
        await placeholders.getExpiredAndRemove()
      );
      assert.strictEqual(0, placeholders.getCount());
    });
  });

  describe('#findByConversationAndRemove', () => {
    it('does nothing if no items found matching conversation', async () => {
      const older = {
        ...getDefaultItem(),
        conversationId: 'conversation-id-1',
      };
      const newer = {
        ...getDefaultItem(),
        conversationId: 'conversation-id-2',
      };
      const items: Array<RetryItemType> = [older, newer];
      window.storage.put(STORAGE_KEY, items);

      const placeholders = new RetryPlaceholders();
      assert.strictEqual(2, placeholders.getCount());
      assert.deepEqual(
        [],
        await placeholders.findByConversationAndRemove('conversation-id-3')
      );
      assert.strictEqual(2, placeholders.getCount());
    });
    it('removes all items matching conversation', async () => {
      const convo1a = {
        ...getDefaultItem(),
        conversationId: 'conversation-id-1',
        receivedAt: Date.now() - 5,
      };
      const convo1b = {
        ...getDefaultItem(),
        conversationId: 'conversation-id-1',
        receivedAt: Date.now() - 4,
      };
      const convo2a = {
        ...getDefaultItem(),
        conversationId: 'conversation-id-2',
        receivedAt: Date.now() + 15,
      };
      const items: Array<RetryItemType> = [convo1a, convo1b, convo2a];
      window.storage.put(STORAGE_KEY, items);

      const placeholders = new RetryPlaceholders();
      assert.strictEqual(3, placeholders.getCount());
      assert.deepEqual(
        [convo1a, convo1b],
        await placeholders.findByConversationAndRemove('conversation-id-1')
      );
      assert.strictEqual(1, placeholders.getCount());

      const convo2b = {
        ...getDefaultItem(),
        conversationId: 'conversation-id-2',
        receivedAt: Date.now() + 16,
      };

      await placeholders.add(convo2b);
      assert.strictEqual(2, placeholders.getCount());
      assert.deepEqual(
        [convo2a, convo2b],
        await placeholders.findByConversationAndRemove('conversation-id-2')
      );
      assert.strictEqual(0, placeholders.getCount());
    });
  });

  describe('#findByMessageAndRemove', () => {
    it('does nothing if no item matching message found', async () => {
      const sentAt = Date.now() - 20;

      const older = {
        ...getDefaultItem(),
        conversationId: 'conversation-id-1',
        sentAt: Date.now() - 10,
      };
      const newer = {
        ...getDefaultItem(),
        conversationId: 'conversation-id-1',
        sentAt: Date.now() - 11,
      };
      const items: Array<RetryItemType> = [older, newer];
      window.storage.put(STORAGE_KEY, items);

      const placeholders = new RetryPlaceholders();
      assert.strictEqual(2, placeholders.getCount());
      assert.isUndefined(
        await placeholders.findByMessageAndRemove('conversation-id-1', sentAt)
      );
      assert.strictEqual(2, placeholders.getCount());
    });
    it('removes the item matching message', async () => {
      const sentAt = Date.now() - 20;

      const older = {
        ...getDefaultItem(),
        conversationId: 'conversation-id-1',
        sentAt: Date.now() - 10,
      };
      const newer = {
        ...getDefaultItem(),
        conversationId: 'conversation-id-1',
        sentAt,
      };
      const items: Array<RetryItemType> = [older, newer];
      window.storage.put(STORAGE_KEY, items);

      const placeholders = new RetryPlaceholders();
      assert.strictEqual(2, placeholders.getCount());
      assert.deepEqual(
        newer,
        await placeholders.findByMessageAndRemove('conversation-id-1', sentAt)
      );
      assert.strictEqual(1, placeholders.getCount());
    });
  });
});
