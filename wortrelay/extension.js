import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Indexed by the stored position setting; prefs.js lists them in panel order.
const positions = [
    ['left', 0], ['center', 0], ['center', -1], ['right', -1], ['left', -1], ['right', 0],
];

export default class Translator extends Extension {
    enable() {
        this.settings = this.getSettings();
        this.session = new Soup.Session({timeout: 8});
        this.settingsSignals = [
            this.settings.connect('changed::position', () => this.build()),
            this.settings.connect('changed::width', () => this.resize()),
        ];
        this.build();
    }

    build() {
        this.cancel();
        this.button?.destroy();
        this.menu?.destroy();
        this.choices = [];
        this.button = new PanelMenu.Button(0.5, 'Übersetzer', true);
        this.button.add_style_class_name('translator-button');
        this.entry = new St.Entry({
            hint_text: 'Text…',
            style_class: 'translator-entry',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
            accessible_name: 'Übersetzer',
        });
        this.resize();
        this.button.add_child(this.entry);
        this.menu = new PopupMenu.PopupMenu(this.button, 0.5, St.Side.TOP);
        // Keep the menu open after a click so the copied suggestion can flash green.
        this.menu.itemActivated = () => {};
        Main.uiGroup.add_child(this.menu.actor);
        this.menu.actor.hide();
        const text = this.entry.clutter_text;
        text.connect('key-focus-in', () => {
            if (!this.entry.get_text().trim())
                this.showHistory();
        });
        text.connect('key-focus-out', () => {
            this.cancel();
            this.menu.close();
        });
        const [box, index] = positions[this.settings.get_int('position')];
        Main.panel.addToStatusArea(this.uuid, this.button, index, box);
        text.connect('text-changed', () => this.queue());
        text.connect('key-press-event', (_, event) => this.keyPress(event.get_key_symbol()));
        this.entry.connect('secondary-icon-clicked', () => {
            this.entry.set_text('');
            this.entry.grab_key_focus();
        });
    }

    resize() {
        this.entry?.set_style(`width: ${this.settings.get_int('width')}px;`);
    }

    keyPress(key) {
        switch (key) {
        case Clutter.KEY_Escape:
            this.cancel();
            this.menu.close();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Up:
        case Clutter.KEY_Down:
            if (!this.menu.isOpen || !this.choices.length)
                return Clutter.EVENT_PROPAGATE;
            this.select(key === Clutter.KEY_Down ? 1 : -1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
        case Clutter.KEY_ISO_Enter:
            this.enter();
            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    select(step) {
        const items = this.choices.map(([item]) => item);
        const current = items.findIndex(item => item.active);
        if (current < 0)
            items[step > 0 ? 0 : items.length - 1].active = true;
        else
            items[(current + step + items.length) % items.length].active = true;
    }

    enter() {
        if (this.menu.isOpen && this.choices.length) {
            const [item, choice] = this.choices.find(([candidate]) => candidate.active) ?? this.choices[0];
            this.copy(item, choice);
            return;
        }
        // Enter before the suggestions arrive: look up right away and copy the first one.
        if (this.timer) {
            GLib.Source.remove(this.timer);
            this.timer = null;
            this.translate(this.entry.get_text().trim());
        }
        if (this.request)
            this.copyWhenReady = true;
    }

    cancel() {
        if (this.timer) {
            GLib.Source.remove(this.timer);
            this.timer = null;
        }
        if (this.flash) {
            GLib.Source.remove(this.flash);
            this.flash = null;
        }
        this.copyWhenReady = false;
        this.request?.cancel();
        this.request = null;
    }

    queue() {
        this.cancel();
        const text = this.entry.get_text();
        if (!text !== !this.entry.get_secondary_icon()) {
            this.entry.set_secondary_icon(text ? new St.Icon({
                icon_name: 'edit-clear-symbolic',
                style_class: 'translator-clear',
            }) : null);
        }
        const query = text.trim();
        this.menu.close();
        if (!query) {
            if (this.entry.clutter_text.has_key_focus())
                this.showHistory();
            return;
        }
        if (new TextEncoder().encode(query).length > 1500) {
            this.show(['Text zu lang']);
            return;
        }
        this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 450, () => {
            this.timer = null;
            this.translate(query);
            return GLib.SOURCE_REMOVE;
        });
    }

    // Lines are plain messages, {title} section headers, or {label, text, query} suggestions.
    show(lines) {
        const {menu} = this;
        menu.removeAll();
        this.choices = [];
        for (const line of lines) {
            if (line.title) {
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(line.title));
                continue;
            }
            const copyable = typeof line !== 'string';
            const item = new PopupMenu.PopupMenuItem(copyable ? line.label : line, {
                reactive: copyable,
                can_focus: false,
            });
            if (copyable) {
                item.connect('activate', () => this.copy(item, line));
                this.choices.push([item, line]);
            }
            item.label.clutter_text.line_wrap = true;
            item.label.set_style('max-width: 320px;');
            menu.addMenuItem(item);
        }
        menu.open();
        if (this.copyWhenReady && this.choices.length)
            this.copy(...this.choices[0]);
        this.copyWhenReady = false;
    }

    copy(item, {text, query}) {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
        this.remember(query, text);
        if (this.flash)
            GLib.Source.remove(this.flash);
        item.add_style_class_name('translator-copied');
        this.flash = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this.flash = null;
            this.menu.close();
            return GLib.SOURCE_REMOVE;
        });
    }

    history() {
        const size = this.settings.get_int('history-size');
        return this.settings.get_value('history').deepUnpack().slice(0, size);
    }

    remember(query, text) {
        const size = this.settings.get_int('history-size');
        if (!size)
            return;
        const history = this.history().filter(([q, t]) => q !== query || t !== text);
        history.unshift([query, text]);
        this.settings.set_value('history', new GLib.Variant('a(ss)', history.slice(0, size)));
    }

    showHistory() {
        const history = this.history();
        if (!history.length) {
            this.menu.close();
            return;
        }
        this.show([
            {title: 'Zuletzt kopiert'},
            ...history.map(([query, text]) => ({label: `${query} → ${text}`, text, query})),
        ]);
    }

    async translate(query) {
        const request = new Gio.Cancellable();
        this.request = request;
        const first = this.settings.get_string('first-language');
        const second = this.settings.get_string('second-language');
        try {
            // Language detection is unreliable for single words, so try both directions
            // and keep the ones that actually translate something.
            const results = await Promise.all([
                this.fetch(query, first, second, request),
                this.fetch(query, second, first, request),
            ]);
            if (this.request !== request)
                return;
            const directions = results
                .map((data, i) => ({
                    title: i === 0 ? `${first} → ${second}` : `${second} → ${first}`,
                    candidates: this.candidates(data),
                }))
                .filter(({candidates}) => candidates.some(line =>
                    line.toLowerCase() !== query.toLowerCase()));
            const choice = text => ({label: text, text, query});
            if (directions.length === 2) {
                this.show(directions.flatMap(({title, candidates}) =>
                    [{title: title.toUpperCase()}, ...candidates.slice(0, 2).map(choice)]));
            } else {
                const candidates = directions[0]?.candidates ?? this.candidates(results[0]);
                if (candidates.length)
                    this.show(candidates.slice(0, 3).map(choice));
                else
                    this.show(['Keine Übersetzung gefunden']);
            }
        } catch {
            if (this.request === request)
                this.show(['Übersetzung gerade nicht verfügbar']);
        } finally {
            if (this.request === request)
                this.request = null;
        }
    }

    candidates(data) {
        const translation = data[0].map(segment => segment?.[0] ?? '').join('');
        const alternatives = (data[1] ?? []).flatMap(group => group[1] ?? []);
        // Use Google's dictionary spelling for the main result when available.
        const dictionarySpelling = alternatives.find(word =>
            word.trim().toLowerCase() === translation.trim().toLowerCase());
        const unique = new Map();
        for (const candidate of [dictionarySpelling ?? translation, ...alternatives]) {
            const line = candidate?.trim();
            if (line && !unique.has(line.toLowerCase()))
                unique.set(line.toLowerCase(), line);
        }
        return [...unique.values()];
    }

    fetch(query, source, target, cancellable) {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&dt=bd&q=` +
            encodeURIComponent(query);
        const message = Soup.Message.new('GET', url);
        return new Promise((resolve, reject) => {
            this.session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    const data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                    if (message.get_status() !== 200 || !Array.isArray(data[0]))
                        throw new Error('Invalid Google Translate response');
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    disable() {
        this.cancel();
        this.settingsSignals.forEach(id => this.settings.disconnect(id));
        this.button.destroy();
        this.menu.destroy();
        this.menu = null;
        this.button = null;
        this.entry = null;
        this.choices = null;
        this.session.abort();
        this.session = null;
        this.settings = null;
    }
}
