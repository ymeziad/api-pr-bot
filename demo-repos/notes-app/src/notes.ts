import type { Note } from "./types";

export class NoteStore {
  private notes = new Map<string, Note>();
  private nextId = 1;

  create(ownerId: string, title: string, body: string): Note {
    const note: Note = { id: `note_${this.nextId++}`, ownerId, title, body, updatedAt: Date.now() };
    this.notes.set(note.id, note);
    return note;
  }

  update(id: string, body: string): Note {
    const note = this.notes.get(id);
    if (!note) throw new Error(`Note not found: ${id}`);
    note.body = body;
    note.updatedAt = Date.now();
    return note;
  }

  listFor(ownerId: string): Note[] {
    return [...this.notes.values()].filter((n) => n.ownerId === ownerId);
  }
}
