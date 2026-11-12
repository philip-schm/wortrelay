# WortRelay

German-to-English translation in the GNOME top bar, with suggestions as you type and click-to-copy.

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

Type German into the **Text…** field and pause briefly. WortRelay shows up to three suggestions when Google provides alternatives. Try **Schloss** for **lock**, **castle**, and **palace**. Click any suggestion to copy it.

To move the field, open WortRelay’s settings in the GNOME Extensions app or run:

```sh
gnome-extensions prefs topbar-translator-live@local
```

WortRelay sends the text you enter to an undocumented Google Translate endpoint. No API key is required.

## License

[MIT License](LICENSE).
