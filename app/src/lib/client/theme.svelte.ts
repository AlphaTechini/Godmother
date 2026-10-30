// Evening / Daylight theme. The inline script in app.html applies a saved choice before paint;
// this keeps the toggle in sync afterwards.
export type Theme = 'light' | 'dark';

class ThemeState {
	current: Theme = $state('dark');

	/** Read the effective theme once the page is in the browser. */
	init() {
		const explicit = document.documentElement.dataset.theme;
		this.current =
			explicit === 'light' || explicit === 'dark'
				? explicit
				: matchMedia('(prefers-color-scheme: light)').matches
					? 'light'
					: 'dark';
	}

	toggle() {
		this.current = this.current === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = this.current;
		try {
			localStorage.setItem('gm-theme', this.current);
		} catch {
			/* private mode: the choice just isn't remembered */
		}
	}
}

export const theme = new ThemeState();
