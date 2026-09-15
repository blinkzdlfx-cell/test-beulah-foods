import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

const storage = new Map();

globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
};

globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};

const {
  getCart,
  getCartItemCount,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  removeCartItems,
  clearCart,
} = await import("../../storefront/js/services/cartService.js");

beforeEach(() => {
  storage.clear();
});

test("getCart returns an empty cart when no cart exists", () => {
  assert.deepEqual(getCart(), []);
});

test("getCart normalizes product ids and valid quantities", () => {
  storage.set(
    "beulah_foods_cart",
    JSON.stringify([
      { productId: 123, quantity: "3" },
      { productId: "rice", quantity: 2 },
    ]),
  );

  assert.deepEqual(getCart(), [
    { productId: "123", quantity: 3 },
    { productId: "rice", quantity: 2 },
  ]);
});

test("getCart falls back to quantity one for invalid quantities", () => {
  storage.set(
    "beulah_foods_cart",
    JSON.stringify([
      { productId: "a", quantity: 0 },
      { productId: "b", quantity: -4 },
      { productId: "c", quantity: "not-a-number" },
    ]),
  );

  assert.deepEqual(getCart(), [
    { productId: "a", quantity: 1 },
    { productId: "b", quantity: 1 },
    { productId: "c", quantity: 1 },
  ]);
});

test("getCart ignores a non-array stored value", () => {
  storage.set("beulah_foods_cart", JSON.stringify({ productId: "a", quantity: 2 }));
  assert.deepEqual(getCart(), []);
});

test("getCart ignores malformed stored JSON", () => {
  storage.set("beulah_foods_cart", "{invalid json");
  assert.deepEqual(getCart(), []);
});

test("getCartItemCount sums normalized quantities", () => {
  storage.set(
    "beulah_foods_cart",
    JSON.stringify([
      { productId: "a", quantity: 2 },
      { productId: "b", quantity: "4" },
    ]),
  );

  assert.equal(getCartItemCount(), 6);
});

test("addToCart creates an item and normalizes its quantity", () => {
  assert.deepEqual(addToCart(123, "3"), [{ productId: "123", quantity: 3 }]);
});

test("addToCart increases an existing item's quantity", () => {
  storage.set("beulah_foods_cart", JSON.stringify([{ productId: "123", quantity: 2 }]));

  assert.deepEqual(addToCart("123", 4), [{ productId: "123", quantity: 6 }]);
});

test("updateCartQuantity removes an item when quantity becomes zero", () => {
  storage.set("beulah_foods_cart", JSON.stringify([{ productId: "123", quantity: 2 }]));

  assert.deepEqual(updateCartQuantity("123", 0), []);
});

test("updateCartQuantity replaces an item's quantity", () => {
  storage.set("beulah_foods_cart", JSON.stringify([{ productId: "123", quantity: 2 }]));

  assert.deepEqual(updateCartQuantity("123", "5"), [{ productId: "123", quantity: 5 }]);
});

test("removeFromCart removes only the requested product", () => {
  storage.set(
    "beulah_foods_cart",
    JSON.stringify([
      { productId: "a", quantity: 2 },
      { productId: "b", quantity: 3 },
    ]),
  );

  assert.deepEqual(removeFromCart("a"), [{ productId: "b", quantity: 3 }]);
});

test("removeCartItems removes a selected set of products", () => {
  storage.set(
    "beulah_foods_cart",
    JSON.stringify([
      { productId: "a", quantity: 2 },
      { productId: "b", quantity: 3 },
      { productId: "c", quantity: 1 },
    ]),
  );

  assert.deepEqual(removeCartItems(["a", "c"]), [{ productId: "b", quantity: 3 }]);
});

test("clearCart removes every cart item", () => {
  storage.set(
    "beulah_foods_cart",
    JSON.stringify([{ productId: "a", quantity: 2 }]),
  );

  assert.deepEqual(clearCart(), []);
  assert.deepEqual(getCart(), []);
});
