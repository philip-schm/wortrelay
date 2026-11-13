import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Google Translate language codes.
const languages = [
    ['de', 'Deutsch'], ['en', 'Englisch'], ['fr', 'Französisch'], ['es', 'Spanisch'],
    ['it', 'Italienisch'], ['pt', 'Portugiesisch'], ['nl', 'Niederländisch'], ['pl', 'Polnisch'],
    ['cs', 'Tschechisch'], ['da', 'Dänisch'], ['sv', 'Schwedisch'], ['no', 'Norwegisch'],
    ['fi', 'Finnisch'], ['el', 'Griechisch'], ['hu', 'Ungarisch'], ['ro', 'Rumänisch'],
    ['ru', 'Russisch'], ['uk', 'Ukrainisch'], ['tr', 'Türkisch'], ['ar', 'Arabisch'],
    ['iw', 'Hebräisch'], ['hi', 'Hindi'], ['ja', 'Japanisch'], ['ko', 'Koreanisch'],
    ['zh-CN', 'Chinesisch'],
];

// Stored position values (see extension.js) in the order they appear on the panel.
const positions = [
    [0, 'Links außen'], [4, 'Links, neben den Arbeitsflächen'], [1, 'Links neben der Uhr'],
    [2, 'Rechts neben der Uhr'], [5, 'Rechts, vor den Systemsymbolen'], [3, 'Rechts außen'],
];

export default class Preferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        this.signals = [];
        window.connect('close-request', () => this.signals.forEach(id => settings.disconnect(id)));
        const page = new Adw.PreferencesPage();

        const languageGroup = new Adw.PreferencesGroup({
            title: 'Sprachen',
            description: 'Text in einer der beiden Sprachen wird in die andere übersetzt.',
        });
        languageGroup.add(this.languageRow(settings, 'first-language', 'second-language', 'Erste Sprache'));
        languageGroup.add(this.languageRow(settings, 'second-language', 'first-language', 'Zweite Sprache'));
        page.add(languageGroup);

        const panelGroup = new Adw.PreferencesGroup({title: 'Obere Leiste'});
        panelGroup.add(this.comboRow(settings, 'position', 'Position des Textfelds', positions,
            value => settings.set_int('position', value)));
        const width = Adw.SpinRow.new_with_range(80, 400, 10);
        width.title = 'Breite des Textfelds';
        width.subtitle = 'In Pixeln';
        settings.bind('width', width, 'value', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(width);
        page.add(panelGroup);

        const historyGroup = new Adw.PreferencesGroup({
            title: 'Verlauf',
            description: 'Zuletzt kopierte Übersetzungen erscheinen, wenn das leere Textfeld angeklickt wird.',
        });
        const size = Adw.SpinRow.new_with_range(0, 20, 1);
        size.title = 'Anzahl der Einträge';
        size.subtitle = '0 schaltet den Verlauf aus';
        settings.bind('history-size', size, 'value', Gio.SettingsBindFlags.DEFAULT);
        historyGroup.add(size);
        const clear = new Adw.ButtonRow({title: 'Verlauf löschen'});
        clear.connect('activated', () => settings.reset('history'));
        historyGroup.add(clear);
        page.add(historyGroup);

        window.add(page);
    }

    languageRow(settings, key, otherKey, title) {
        return this.comboRow(settings, key, title, languages, code => {
            const previous = settings.get_string(key);
            // Picking the other row's language swaps the two instead of making them equal.
            if (settings.get_string(otherKey) === code)
                settings.set_string(otherKey, previous);
            settings.set_string(key, code);
        });
    }

    comboRow(settings, key, title, options, store) {
        const row = new Adw.ComboRow({
            title,
            model: Gtk.StringList.new(options.map(([, label]) => label)),
        });
        const read = () => settings.get_value(key).unpack();
        const sync = () => {
            const index = options.findIndex(([value]) => value === read());
            if (index >= 0 && row.selected !== index)
                row.selected = index;
        };
        sync();
        this.signals.push(settings.connect(`changed::${key}`, sync));
        row.connect('notify::selected', () => {
            const [value] = options[row.selected];
            if (value !== read())
                store(value);
        });
        return row;
    }
}
