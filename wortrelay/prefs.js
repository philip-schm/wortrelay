import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class Preferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({title: 'Obere Leiste'});
        const row = new Adw.ComboRow({
            title: 'Position des Textfelds',
            model: Gtk.StringList.new([
                'Links außen', 'Links neben der Uhr', 'Rechts neben der Uhr', 'Rechts außen',
            ]),
        });
        this.getSettings().bind('position', row, 'selected', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
        page.add(group);
        window.add(page);
    }
}
