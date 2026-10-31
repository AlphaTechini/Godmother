// The contract for cloud image storage. Changing provider means writing one new adapter.

export interface ImageStore {
	/** Stores private bytes under an id. Storing the same id twice is safe. */
	put(id: string, bytes: Uint8Array, mime: string): Promise<void>;
	/** The stored bytes, or null when this id isn't stored. Throws when the service can't be reached. */
	get(id: string, mime: string): Promise<Uint8Array | null>;
}
