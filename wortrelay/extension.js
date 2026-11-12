import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const positions = [
    ['left', 0], ['center', 0], ['center', -1], ['right', -1],
];

export default class Translator extends Extension {
    enable() {
        this.settings = this.getSettings();
        this.session = new Soup.Session({timeout: 8});
        this.positionSignal = this.settings.connect('changed::position', () => this.build());
        this.build();
    }

    build() {
        this.cancel();
        this.button?.destroy();
        this.menu?.destroy();
        this.button = new PanelMenu.Button(0.5, 'Deutsch nach Englisch', true);
        this.entry = new St.Entry({
            hint_text: 'Text…',
            style_class: 'translator-entry',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
            accessible_name: 'Deutsch nach Englisch',
        });
        this.button.add_child(this.entry);
        this.menu = new PopupMenu.PopupMenu(this.button, 0.5, St.Side.TOP);
        Main.uiGroup.add_child(this.menu.actor);
        this.menu.actor.hide();
        this.entry.clutter_text.connect('key-focus-out', () => {
            this.cancel();
            this.menu.close();
        });
        const [box, index] = positions[this.settings.get_int('position')];
        Main.panel.addToStatusArea(this.uuid, this.button, index, box);
        this.entry.clutter_text.connect('text-changed', () => this.queue());
        this.entry.clutter_text.connect('key-press-event', (_, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this.cancel();
            this.menu.close();
            return Clutter.EVENT_STOP;
        });
    }

    cancel() {
        if (this.timer) {
            GLib.Source.remove(this.timer);
            this.timer = null;
        }
        this.request?.cancel();
        this.request = null;
    }

    queue() {
        this.cancel();
        const query = this.entry.get_text().trim();
        this.menu.close();
        if (!query)
            return;
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

    show(lines, copyable = false) {
        const {menu} = this;
        menu.removeAll();
        for (const line of lines) {
            const item = new PopupMenu.PopupMenuItem(line, {
                reactive: copyable,
                can_focus: false,
            });
            if (copyable) {
                item.connect('activate', () => {
                    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, line);
                    menu.close();
                });
            }
            item.label.clutter_text.line_wrap = true;
            item.label.set_style('max-width: 320px;');
            menu.addMenuItem(item);
        }
        menu.open();
    }

    translate(query) {
        const request = new Gio.Cancellable();
        this.request = request;
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=de&tl=en&dt=t&dt=bd&q=' +
            encodeURIComponent(query);
        const message = Soup.Message.new('GET', url);
        this.session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, request, (session, result) => {
            try {
                const bytes = session.send_and_read_finish(result);
                if (this.request !== request)
                    return;
                const data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                if (message.get_status() !== 200 || !Array.isArray(data[0]))
                    throw new Error('Invalid Google Translate response');
                const translation = data[0].map(segment => segment?.[0] ?? '').join('');
                const alternatives = (data[1] ?? []).flatMap(group => group[1] ?? []);
                // Use Google's dictionary spelling for the main result when available.
                const dictionarySpelling = alternatives.find(word =>
                    word.trim().toLowerCase() === translation.trim().toLowerCase());
                const candidates = [dictionarySpelling ?? translation, ...alternatives];
                const unique = new Map();
                for (const candidate of candidates) {
                    const line = candidate?.trim();
                    if (line && !unique.has(line.toLowerCase()))
                        unique.set(line.toLowerCase(), line);
                }
                if (unique.size)
                    this.show([...unique.values()].slice(0, 3), true);
                else
                    this.show(['Keine Übersetzung gefunden']);
            } catch {
                if (this.request === request)
                    this.show(['Übersetzung gerade nicht verfügbar']);
            } finally {
                if (this.request === request)
                    this.request = null;
            }
        });
    }

    disable() {
        this.cancel();
        this.settings.disconnect(this.positionSignal);
        this.button.destroy();
        this.menu.destroy();
        this.menu = null;
        this.button = null;
        this.entry = null;
        this.session.abort();
        this.session = null;
        this.settings = null;
    }
}
