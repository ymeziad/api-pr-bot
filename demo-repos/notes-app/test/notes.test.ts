import { describe, expect, it } from "vitest";
import { NoteStore } from "../src/notes";

describe("NoteStore", () => {
  it("creates, updates and lists notes per owner", () => {
    const store = new NoteStore();
    const a = store.create("u1", "Groceries", "milk");
    store.create("u2", "Todo", "ship it");
    store.update(a.id, "milk, eggs");
    expect(store.listFor("u1")).toHaveLength(1);
    expect(store.listFor("u1")[0].body).toBe("milk, eggs");
  });
});
