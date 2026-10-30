// Shared domain types: the contract between the server (agent, YouCam, store) and the UI.
// Everything here is JSON-serialisable. Import with `#lib/types`.

export type Id = string;

/* ------------------------------------------------------------------ assets */

export type AssetKind = 'upload' | 'result' | 'product' | 'generated' | 'demo';

/** A stored image. `url` is always an app URL (/api/assets/:id), never a 2-hour YouCam URL. */
export interface Asset {
	id: Id;
	url: string;
	kind: AssetKind;
	mime: string;
	width?: number;
	height?: number;
	label?: string;
}

export type PhotoSlot = 'fullBody' | 'portrait' | 'hand';

export type AttachmentPurpose = PhotoSlot | 'invitation' | 'wardrobe' | 'other';

export interface Attachment {
	asset: Asset;
	purpose: AttachmentPurpose;
}

/* ------------------------------------------------------------- money, place */

export interface Money {
	amount: number;
	/** ISO 4217, e.g. "NGN", "USD". */
	currency: string;
}

export interface PriceRange {
	min: Money;
	max: Money;
}

export interface UserLocation {
	city?: string;
	region?: string;
	country: string;
	countryCode?: string;
	currency: string;
	source: 'asked' | 'detected' | 'typed';
}

export interface NamedColor {
	name: string;
	hex: string;
}

/* -------------------------------------------------------------------- event */

export type DressCode =
	| 'white_tie'
	| 'black_tie'
	| 'black_tie_optional'
	| 'formal'
	| 'cocktail'
	| 'semi_formal'
	| 'business'
	| 'smart_casual'
	| 'casual'
	| 'themed'
	| 'traditional'
	| 'unknown';

export interface SourceLink {
	title: string;
	url: string;
}

export interface EventBrief {
	name: string;
	/** Human-readable date as found, e.g. "Sat 14 Nov 2026, 7pm". */
	date?: string;
	venue?: string;
	city?: string;
	/** Dress code exactly as stated by the event, e.g. "Black tie". Overrides every other signal. */
	dressCode?: string;
	dressCodeNormalized: DressCode;
	theme?: string;
	colors: NamedColor[];
	/** e.g. "Indoor ballroom, evening". */
	setting?: string;
	notes: string[];
	origin: 'web' | 'invitation' | 'typed';
	sources: SourceLink[];
}

/* ------------------------------------------------------------ pieces, looks */

export type GarmentCategory = 'upper_body' | 'lower_body' | 'full_body' | 'outer' | 'shoes';
export type AccessoryCategory = 'earrings' | 'necklace' | 'watch' | 'ring' | 'bracelet';
export type PieceRole = GarmentCategory | AccessoryCategory;

export interface Product {
	title: string;
	brand?: string;
	shop: string;
	url: string;
	/** Original product image URL on the shop. */
	imageUrl?: string;
	/** Our stored copy of the product image (what is tried on). */
	image?: Asset;
	price?: Money;
	/** ISO timestamp when the price was checked. */
	checkedAt: string;
}

export interface SewDesign {
	prompt: string;
	image: Asset;
	estimate: PriceRange;
	notes?: string;
}

export interface WardrobeItem {
	id: Id;
	image: Asset;
	role: PieceRole;
	description: string;
	colors: NamedColor[];
	formality?: string;
}

export type PieceSource =
	| { type: 'wardrobe'; wardrobeItemId: Id }
	| { type: 'product'; product: Product }
	| { type: 'sew'; design: SewDesign };

export interface LookPiece {
	id: Id;
	role: PieceRole;
	name: string;
	colorHex?: string;
	source: PieceSource;
	/** The reference image used for try-on (wardrobe photo, product photo or sew design). */
	image?: Asset;
}

export type RenderStatus = 'pending' | 'rendering' | 'done' | 'failed' | 'skipped';

export interface RenderStep {
	label: string;
	status: RenderStatus;
	image?: Asset;
	units?: number;
	seconds?: number;
	error?: string;
}

export interface Look {
	id: Id;
	/** 1, 2 or 3. */
	index: number;
	title: string;
	/** One line, e.g. "Emerald satin column with gold accents". */
	summary: string;
	/** Why this fits the dress code, colours, location and the user. */
	rationale: string;
	palette: NamedColor[];
	pieces: LookPiece[];
	render: {
		status: RenderStatus;
		image?: Asset;
		error?: string;
		seconds?: number;
		steps: RenderStep[];
	};
	/** Increments every time the look is revised. */
	version: number;
}

export interface Decision {
	lookId: Id;
	reason: string;
	ranking: { lookId: Id; score: number; note: string }[];
}

/* ------------------------------------------------------- face and finishing */

export interface FaceProfile {
	skinTone?: NamedColor;
	undertone?: 'warm' | 'cool' | 'neutral' | 'olive';
	lipColor?: NamedColor;
	eyeColor?: NamedColor;
	hairColor?: NamedColor;
	faceShape?: string;
	/** Feature name -> value, e.g. { eye_shape: "almond", lip_shape: "full" }. */
	features: Record<string, string>;
}

export interface MakeupStep {
	area: string;
	product: string;
	colorHex?: string;
	instruction: string;
}

export interface MakeupResult {
	image: Asset;
	name: string;
	rationale: string;
	palette: NamedColor[];
	steps: MakeupStep[];
}

export interface HairResult {
	image: Asset;
	templateId: string;
	templateName: string;
	rationale: string;
}

export interface AccessoryResult {
	piece: LookPiece;
	image: Asset;
	panel: 'portrait' | 'hand';
}

/** The three-panel lookbook for the chosen look (PRD §6). */
export interface Lookbook {
	lookId: Id;
	/** Outfit + shoes on the full-body photo. */
	full?: Asset;
	/** Makeup + hair + earrings + necklace on the portrait. */
	face?: Asset;
	/** Watch, ring, bracelet on the hand photo. */
	hand?: Asset;
	makeup?: MakeupResult;
	hair?: HairResult;
	accessories: AccessoryResult[];
	/** Finishing steps in progress or done, for the UI's progress display. */
	steps: RenderStep[];
}

/* ----------------------------------------------------------------- shopping */

export interface ShoppingItem {
	pieceId: Id;
	role: PieceRole;
	name: string;
	shop?: string;
	url?: string;
	image?: Asset;
	kind: 'buy' | 'sew';
	/** Exact price for bought items. */
	price?: Money;
	/** Estimated range for sewn items. */
	estimate?: PriceRange;
}

export interface ShoppingList {
	currency: string;
	total: PriceRange;
	items: ShoppingItem[];
	/** ISO timestamp the prices were checked. */
	checkedAt: string;
	/** e.g. "Only covers pieces you didn't upload from your wardrobe." */
	note: string;
}

/* -------------------------------------------------------------------- units */

export interface UnitLedgerEntry {
	at: string;
	feature: string;
	units: number;
	taskId?: string;
	ok: boolean;
	seconds?: number;
}

export interface UnitsState {
	spent: number;
	cap: number;
	ledger: UnitLedgerEntry[];
}

/* --------------------------------------------------------------------- chat */

/** Rich cards rendered inside assistant messages. */
export type Block =
	| { type: 'event'; event: EventBrief }
	| { type: 'photo_request'; slots: PhotoSlot[]; reason: string }
	| { type: 'wardrobe'; itemIds: Id[] }
	| { type: 'products'; products: Product[] }
	| { type: 'sew_design'; design: SewDesign }
	| { type: 'looks'; lookIds: Id[] }
	| { type: 'decision'; decision: Decision }
	| { type: 'face_profile'; profile: FaceProfile }
	| { type: 'lookbook'; lookId: Id }
	| { type: 'shopping_list' }
	/** Quick replies shown as chips under the message. */
	| { type: 'suggestions'; options: string[] }
	| { type: 'error'; message: string };

export interface ChatMessage {
	id: Id;
	role: 'user' | 'assistant';
	createdAt: string;
	text: string;
	attachments: Attachment[];
	blocks: Block[];
}

/** UI buttons send these alongside (or instead of) text. */
export type UserAction =
	| { type: 'decide_for_me' }
	| { type: 'choose_look'; lookId: Id }
	| { type: 'finish_look'; lookId: Id }
	| { type: 'shopping_list' };

/* ------------------------------------------------------------------ session */

export type Stage = 'event' | 'photos' | 'looks' | 'chosen' | 'finishing' | 'done';

export interface Session {
	id: Id;
	createdAt: string;
	mode: 'live' | 'demo';
	stage: Stage;
	location?: UserLocation;
	event?: EventBrief;
	photos: Partial<Record<PhotoSlot, Asset>>;
	wardrobe: WardrobeItem[];
	looks: Look[];
	decision?: Decision;
	chosenLookId?: Id;
	face?: FaceProfile;
	lookbook?: Lookbook;
	shoppingList?: ShoppingList;
	messages: ChatMessage[];
	units: UnitsState;
}

/** Session without the message history; sent on every state change. */
export type SessionSnapshot = Omit<Session, 'messages'>;

/* ------------------------------------------------------------ stream events */

/**
 * Server-sent events from POST /api/sessions/:id/messages.
 * Each SSE frame is `data: <JSON StreamEvent>\n\n`.
 */
export type StreamEvent =
	/** The echoed user message (with stored attachments) and the new, empty assistant message. */
	| { type: 'message'; message: ChatMessage }
	| { type: 'text_delta'; messageId: Id; delta: string }
	| { type: 'block'; messageId: Id; block: Block }
	/** Tool progress, e.g. "Searching the web for the Met Gala 2026". Same id is re-sent with new status. */
	| {
			type: 'activity';
			id: Id;
			label: string;
			status: 'running' | 'done' | 'failed';
			detail?: string;
	  }
	/** Full session state (minus messages) after any change. */
	| { type: 'session'; session: SessionSnapshot }
	| { type: 'error'; message: string }
	/** End of the turn. Always the last frame. */
	| { type: 'done' };
