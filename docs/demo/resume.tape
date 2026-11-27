Output docs/resume.gif

Set Shell bash
Set FontSize 15
Set Width 1100
Set Height 760
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 70ms

# alice has a conversation running in the background; we carry it on as bob
Hide
Type "source docs/demo/setup.sh && source /src/docs/demo/conversations.sh"
Enter
Wait@180s /^\$$/
Show

Sleep 500ms
Type "clauder"
Sleep 400ms
Enter
Sleep 1.5s
Down
Sleep 500ms
Down
Sleep 700ms
Enter
Sleep 2.5s
Down
Sleep 1.5s
Enter
Sleep 8s
Type "Now say it in one sentence"
Sleep 500ms
Enter
Sleep 9s
