# WortRelay

Translation between two languages in the GNOME top bar, with suggestions as you type and click-to-copy. German and English by default.

## Install

Requires GNOME Shell 49 and an internet connection. From the repository folder, run:

```sh
gnome-extensions pack --force --extra-source=LICENSE
gnome-extensions install --force topbar-translator-live@local.shell-extension.zip
```

Log out and back in so GNOME picks up the extension, then enable it:

```sh
gnome-extensions enable topbar-translator-live@local
```

## Use

Type in either language into the **Text…** field and pause briefly. WortRelay translates into the other language and shows up to three suggestions when Google provides alternatives. Try **Schloss** for **lock**, **castle**, and **palace**, or **castle** for **Schloss** and **Burg**. Words that exist in both languages, such as **Gift**, show suggestions for both directions. Click any suggestion to copy it, or use the arrow keys and press Enter. Pressing Enter without choosing copies the first suggestion, even if you press it before the suggestions appear. The copied suggestion briefly turns green.

Click the empty field to see your recently copied translations. The ✕ button clears the field.

To choose the two languages, move the field, change its width, or set the history length, open WortRelay’s settings in the GNOME Extensions app or run:

```sh
gnome-extensions prefs topbar-translator-live@local
```

WortRelay sends the text you enter to an undocumented Google Translate endpoint. No API key is required.

## License

[MIT License](LICENSE).
