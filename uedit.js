/**
 * Author: Amir Hadzic
 * Web: http://www.randomshouting.com
 */
"use strict";

if ( !Function.prototype.bind ) {
  Function.prototype.bind = function( obj ) {
    var slice = [].slice,
        args = slice.call(arguments, 1), 
        self = this, 
        nop = function () {}, 
        bound = function () {
          return self.apply( this instanceof nop ? this : ( obj || {} ), 
                              args.concat( slice.call(arguments) ) );    
        };
    
    nop.prototype = self.prototype;
    
    bound.prototype = new nop();
    
    return bound;
  };
}

if (!String.prototype.startsWith){
    String.prototype.startsWith = function(string){
        return this.substr(0, string.length) === string;
    }
}

var Uedit = function(){
    var textarea = null;
    
    var HELP_URL = "http://daringfireball.net/projects/markdown/syntax";
    
    var KEY_U = 90;
    var KEY_I = 73;
    var KEY_D = 68;
    var KEY_B = 66;
    var KEY_K = 75;
    var KEY_SPACE = 32;
    var KEY_ENTER = 13;
    
    // Change this line to \t if you want to use tabs instead of spaces
    var tab = "    ";
    var isLeavingListItem = false;
    var listType = '';
    var sel_lastListItem = null;
    var lastItemNumber = null;
    var cachedSelection = null;
    
    var isBadEol = typeof window.opera != "undefined" 
        || (navigator.appName && navigator.appName == "Microsoft Internet Explorer");
    var isIE = navigator.appName && navigator.appName == "Microsoft Internet Explorer";
        
    function log(record){
        var now = new Date();
       
        
        if (typeof UEDIT_DEBUG === "undefined") {
            return;
        }

        typeof console !== "undefined" && console.log(
            "uedit -> [" + now.getHours() + ":" 
                + now.getMinutes() + ":" 
                + now.getSeconds() + "] " 
            + record
        );
    }
    
    this.stateManager = {};
    (function(){
        var _ueditor = arguments[0];
        var _states = [];
        
        var _stateTypes = {
            activeState: 0,
            staticState: 1
        };
        
        var _stateType = _stateTypes.activeState;
        var _preLockState = null;
        var _canRedo = false;
        var _staticStateIndex = null;

        this.init = function(){
            // Save the initial state.
            this.save();
        }       
        
        /**
         * This function should be called when user edits the current state.
         */
        this.gotoActiveStateType = function(){
            if (_stateType == _stateTypes.staticState){
                // We need to delete any remaining states that we can redo.
                var remainingStates = _states.length - _staticStateIndex -1;
                _states.splice(_staticStateIndex + 1, remainingStates);
                
                _canRedo = false;
                _stateType = _stateTypes.activeState;
                _staticStateIndex = null;    
            }
        }
        
        this.save = function(){
            if (_stateType == _stateTypes.activeState){
                var newState = this.getCurrentState();
                
                if (!_states.length || 
                    !_states[_states.length - 1].equals(newState))
                {
                    _states.push(this.getCurrentState());    
                }
            } else {
                throw "New state cannot be saved while in static state.";
            }
        }
        
        this.undo = function(){
            if (this.canUndo()){               
                if (_staticStateIndex == null){
                    // Set static state to the last saved state.
                    _stateType = _stateTypes.staticState;
                    _staticStateIndex = _states.length - 1;
                    
                    // Save the current state, so we can redo.
                    _states.push(this.getCurrentState());
                    _canRedo = true;
                } else {
                    _staticStateIndex--;
                }
                
                _states[_staticStateIndex].restore();
                
                if (_ueditor.setRedoStateCallback){
                    _ueditor.setRedoStateCallback(this.canRedo());  
                }
                
                if (_ueditor.setUndoStateCallback){
                    _ueditor.setUndoStateCallback(this.canUndo());
                }
            }
        }
        
        this.redo = function(){
            if (this.canRedo()){
                // Move to the next state
                _staticStateIndex++;
                
                // Restore the state
                _states[_staticStateIndex].restore();
                
                if (_staticStateIndex == _states.length - 1){
                    // We are at the last state, we can't redo anymore
                    // go back to the active state.
                    _staticStateIndex = null;
                    _stateType = _stateTypes.activeState;
                    _canRedo = false;   
                }
                
                if (_ueditor.setRedoStateCallback){
                    _ueditor.setRedoStateCallback(this.canRedo());  
                }
                
                if (_ueditor.setUndoStateCallback){
                    _ueditor.setUndoStateCallback(this.canUndo());
                }
            }
        }
        
        this.canUndo = function(){
            if (_stateType == _stateTypes.activeState){
                return (_states[_states.length - 1] != _ueditor.getText());
            } else if (_stateType == _stateTypes.staticState) {
                return (_staticStateIndex > 0);
            } else {
            	return false;
            }
        }
        
        this.canRedo = function(){
            return (_canRedo && _stateType == _stateTypes.staticState);
        }
        
        this.getSelectedState = function(){
            if (_stateType == _stateTypes.staticState){
                return _states[_staticStateIndex];
            } else {
                return _states[_states.length - 1];
            }
        }
        
        this.getCurrentState = function(){
            return {
                selection: _ueditor.getSelection(),
                content: _ueditor.getText(),
                
                restore: function(){
                    _ueditor.setText(this.content);
                    _ueditor.select(this.selection);
                },
                
                equals: function(state){
                    return this.content == state.content &&
                           this.selection.equals(state.selection);
                }
            }
        }
    }).bind(this.stateManager, this)();
        
    this.init = function(targetTextArea){       
        if (targetTextArea == null || targetTextArea.type != "textarea"){
            throw "Invalid target text area";
        }
        
        textarea = targetTextArea;
        this.stateManager.init();
        
        textarea.onkeyup = this.onkeyup.bind(this);
        textarea.onkeydown = this.onkeydown.bind(this);
        
        textarea.onpaste = (function(){
            this.saveState();
        }).bind(this);
        
        textarea.oncut = (function(){
            this.saveState();
        }).bind(this);
        
    }
    
    this.fixEol = function(text) {
        text = text.replace(/\r\n/g, "\n");
        text = text.replace(/\r/g, "\n");
        return text;
    }
    
    this.windowWidth = function() {
        if (window.innerWidth) {
            return window.innerWidth;
        } else if (document.documentElement) {
            return document.documentElement.clientWidth;
        } else if (document.body) {
            return document.body.clientWidth;
        }        
        
        return null;
    }
    
    this.windowHeight = function() {
        if (window.innerHeight) {
            return window.innerHeight;
        } else if (document.documentElement) {
            return document.documentElement.clientHeight;
        } else if (document.body) {
            return document.body.clientHeight;
        }
        
        return null;
    }
    
    function Selection(start, end){
        this.start = start;
        this.end = end;
        
        this.equals = (function(selection){
            return this.start == selection.start &&
                   this.end == selection.end;    
        }).bind(this);
        
        this.length = (function(){
            return this.end - this.start;
        }).bind(this);
    }
    
    this.getSelection = function(){
        var start = 0, end = 0, normalizedValue, range,
            textInputRange, len, endRange, el = textarea;
               
        if (typeof el.selectionStart == "number" && typeof el.selectionEnd == "number") {
            start = el.selectionStart;
            end = el.selectionEnd;
        } else {
            if (cachedSelection != null) {
                range = cachedSelection;
            } else {
                range = document.selection.createRange();
            }

            if (range && range.parentElement() == el) {
            
                len = el.value.length;
                normalizedValue = el.value.replace(/\r\n/g, "\n");

                // Create a working TextRange that lives only in the input
                textInputRange = el.createTextRange();
                textInputRange.moveToBookmark(range.getBookmark());

                // Check if the start and end of the selection are at the very end
                // of the input, since moveStart/moveEnd doesn't return what we want
                // in those cases
                endRange = el.createTextRange();
                endRange.collapse(false);

                if (textInputRange.compareEndPoints("StartToEnd", endRange) > -1) {
                    start = end = len;
                } else {
                    start = -textInputRange.moveStart("character", -len);
                    start += normalizedValue.slice(0, start).split("\n").length - 1;

                    if (textInputRange.compareEndPoints("EndToEnd", endRange) > -1) {
                        end = len;
                    } else {
                        end = -textInputRange.moveEnd("character", -len);
                        end += normalizedValue.slice(0, end).split("\n").length - 1;
                    }
                }
            }
        }
        
        // IE and opera are using \r\n for line breaks.
        // This breaks the selection, so now we need to fix that.                
        var matches = el.value.substring(0, start).match(/\r/g);
        
        if (matches) {
           start -= matches.length;
           end -= matches.length;
        }
        
        return new Selection(start, end);     
    }
    
    this.setSelection = function(start, end){
        if (textarea.setSelectionRange) {
            // Fix for opera because it users \r\n instead of \n
            var fixedText = this.fixEol(textarea.value);
            
            var matches = fixedText.substring(0, start).match(/\n/g);
            
            if (matches && isBadEol) {
                start += matches.length;
                end += matches.length;
            }
            
            textarea.setSelectionRange(start, end);
        } else {
            var range = textarea.createTextRange();
            var textLength = this.getText().length;
            range.moveStart("character", -textLength);
            range.moveEnd("character", -textLength);
            range.moveEnd("character", end);
            range.moveStart("character", start);
            range.select();
        }
        
        textarea.focus();
    }
    
    this.getText = function(){
        return textarea.value;
    }
    
    this.setText = function(text){
        textarea.value = text;
    }
    
    this.getSelectedText = function(){
        var selection = this.getSelection();
        
        return this.fixEol(textarea.value).substr(
            selection.start, 
            selection.length()
        );
    }
        
    
    this.cacheSelection = function(){
        if (document.selection && document.selection.createRange) {
            cachedSelection = document.selection.createRange();
        }
    }
    
    this.purgeCachedSelection = function(){
        cachedSelection = null;
    }
    
    this.onkeyup = function(e){
        if (e == undefined) {
            e = event;
        }

        // If the text is changed, make the state manager go to active state
        // type if it's not in it already.
        if (this.stateManager.getSelectedState().content != this.getText()){
            this.stateManager.gotoActiveStateType();
            
            if (this.setRedoStateCallback){
                this.setRedoStateCallback(this.stateManager.canRedo());  
            }
            
            if (this.setUndoStateCallback){
                this.setUndoStateCallback(this.stateManager.canUndo());
            }
        }
        
        if (isLeavingListItem && listType == 'ul' && e.keyCode == 13){
            // The user pressed enter while editing an unordered list item
            var lastListItem = this.getTextAtSelection(sel_lastListItem);
            
            if ((/^(  \*\s*)$/i).test(lastListItem)){                
                var selection = this.replaceTextAtSelection("\n", sel_lastListItem);
            } else {
                var selection = this.injectText('  * ');
                this.selectEnd(selection);
            }
            
            isLeavingListItem = false;
            listType = null;
            sel_lastListItem = null;
        } else if (isLeavingListItem && listType == 'num' && e.keyCode == 13){           
            var lastListItem = this.getTextAtSelection(sel_lastListItem);
            
            if ((/^(  \d+\.\s*)$/i).test(lastListItem)){                
                var selection = this.replaceTextAtSelection("\n", sel_lastListItem);
                this.selectEnd(selection);
            } else {
                var selection = this.injectText('  ' + (++lastItemNumber) + '. ');
                this.selectEnd(selection);    
            }
            
            isLeavingListItem = false;
            listType = null;
            sel_lastListItem = null;
            lastItemNumber = null;
        }
    }   
    
    this.onkeydown = function(e){       
        if (e == undefined) {
            e = event;
            
            e.preventDefault = (function() {
                this.returnValue = false;
            }).bind(e);
        }
        
        
        switch(true) {
        case e.ctrlKey && e.shiftKey && e.keyCode == KEY_U:
            e.preventDefault();
            this.stateManager.redo();
        case !e.altKey && e.ctrlKey && e.keyCode == KEY_U:
            e.preventDefault();
            this.stateManager.undo();
            break;
        case !e.altKey && e.ctrlKey && e.keyCode == KEY_B:
            e.preventDefault();
            this.button_bold();
            break;
        case !e.altKey && e.ctrlKey && e.keyCode == KEY_I:
            e.preventDefault();
            this.button_italic();
            break;
        case !e.altKey && e.ctrlKey && e.keyCode == KEY_D:
            e.preventDefault();
            this.button_deleted();
            break;
        case !e.altKey && e.ctrlKey && e.keyCode == KEY_K:
            e.preventDefault();
            this.button_code();
            break;
        case e.keyCode == KEY_ENTER || e.keyCode == KEY_SPACE:
            this.saveState();
            break;
        }

        if (e.keyCode == KEY_ENTER){
            // Enter was pressed, check if the user is editing a list at the
            // moment.
            
            var line = this.getCurrentLine();
            var matches = null;
            if (line.startsWith("  *")){
                // Leaving unordered list item
                isLeavingListItem = true;
                listType = 'ul';
                sel_lastListItem = this.getCurrentLineSelection();
            } else if ((matches = line.match(/^  (\d+)\./i)) != null){
                // Leaving numbered list item
                isLeavingListItem = true;
                listType = "num";
                sel_lastListItem = this.getCurrentLineSelection();
                lastItemNumber = parseInt(matches[1]);
            }
        }
    }
    
    this.getTextAtSelection = function(selection){
        var text = this.fixEol(this.getText());
        return text.substr(selection.start, selection.length());
    }
    
    this.replaceTextAtSelection = function(replacement, selection){
        var text = this.fixEol(this.getText());
        this.setText(
            text.substr(0, selection.start) +
            replacement +
            text.substr(selection.end)
        );
        
        var newSelection = new Selection(
            selection.start, 
            selection.start + replacement.length
        );
        return newSelection;
    }
    
    this.replaceSelectedText = function(text, dropSelection){
        var selection = this.getSelection();

        var newSelection = this.replaceTextAtSelection(text, selection)
        
        this.select(newSelection);
        return newSelection;
    }
    
    this.getCurrentLineSelection = function(){
        var text = this.fixEol(this.getText());
        var selection = this.getSelection();
        var startIndex = selection.start;
        var endIndex = selection.end;
        
        while(startIndex > 0 && text.charAt(startIndex - 1) != "\n"){ 
            startIndex--; 
        }
        
        while(endIndex < text.length && text.charAt(endIndex) != "\n")
        {
            endIndex++;
        }
        
        return new Selection(startIndex, endIndex);
    }
    
    this.getCurrentLine = function(){
        return this.getTextAtSelection(this.getCurrentLineSelection());
    }
    
    this.saveState = function(){
        this.stateManager.gotoActiveStateType();
        this.stateManager.save();
    }
    
    this.indent = function(){
        var lines = this.getSelectedText().split("\n");    
        
        for (var i = 0; i < lines.length; i++){
            lines[i] = tab + lines[i];
        }
        
        this.replaceSelectedText(lines.join("\n"));
    }
    
    this.unindent = function(){
        var lines = this.getSelectedText().split("\n");    
        
        for (var i = 0; i < lines.length; i++){
            if (lines[i].substr(0, tab.length) == tab){
                lines[i] = lines[i].substr(tab.length); 
            }
        }
        
        this.replaceSelectedText(lines.join("\n"));
    }
    
    this.applyTag = function(openingTag, closingTag){
        var selection = this.getSelection();
        
        if (selection.length() == 0) {
            selection = this.injectText(openingTag + (closingTag || openingTag));
            
            var newSelection = new Selection(
                selection.start + openingTag.length,
                selection.start + openingTag.length
            );
            
            this.select(newSelection);
            return newSelection;
        }
        else {
            return this.replaceSelectedText(openingTag + this.getSelectedText() + (closingTag || openingTag));
        }
    }
    
    this.applyPrefix = function(prefix){
        return this.replaceSelectedText(prefix + this.getSelectedText());
    }
    
    this.applySuffix = function(suffix) {
        return this.replaceSelectedText(this.getSelectedText() + suffix);
    }
    
    this.injectText = function(text){
        var selection = this.getSelection();
        var currentText = this.fixEol(textarea.value);
        
        textarea.value = currentText.substr(0, selection.start) +
                         text +
                         currentText.substr(selection.start);
        
        var newSelection = new Selection(
            selection.start,
            selection.start + text.length
        );
        
        return newSelection;                        
    }
    
    this.focus = function(){
        // focus() will be obsolete in HTML5 ?
        textarea.focus();
    }
    
    this.select = function(selection){
        this.setSelection(selection.start, selection.end);
    }
    
    this.selectEnd = function(selection){
        var newSelection = new Selection(selection.end, selection.end);
        this.select(newSelection);
        return newSelection;
    }
    
    this.selectStart = function(selection){
        var newSelection = new Selection(selection.start, selection.start);
        this.select(newSelection);
        return newSelection;
    }
    
    this.createForm = function(width, height){
        var form = new Object();
        var innerHeight = this.windowHeight();
        var innerWidth = this.windowWidth();
        
        form.modalOverlay = document.createElement('div');
        form.modalOverlay.id = 'uedit_ui_form_modal_overlay';
        
        if (isIE) {
            form.modalOverlay.style.height = this.windowHeight();
            form.modalOverlay.style.width = this.windowWidth();
            form.modalOverlay.style.left = document.documentElement.scrollLeft;
        } else {
            form.modalOverlay.style.height = "100%"
            form.modalOverlay.style.width = "100%"
            form.modalOverlay.style.left = "0";
        }
        
        
        form.content = document.createElement('div');
        form.content.tabIndex = '0';
        form.content.className = 'uedit_ui_form';
        form.content.style.width = width+'px';
        form.content.style.height = height+'px';
        form.content.style.top = ((innerHeight/2) - (height/2)) + 'px';
        form.content.style.left = ((innerWidth/2) - (width/2)) + 'px';
        
        form.closeButton = document.createElement('a');
        form.closeButton.innerHTML = '<img src="gfx/close_icon.png" />';
        form.closeButton.className = 'uedit_ui_form_close';
        form.closeButton.onclick = (function(){
            document.body.removeChild(form.modalOverlay);
            document.body.removeChild(form.content);
            
            this.purgeCachedSelection();
        }).bind(this);
        
        form.content.appendChild(form.closeButton);
        
        form.content.onkeyup = function(ev){
            if (ev == undefined) {
                ev = event;
            }
            
            if (ev.keyCode == 27){
                form.closeButton.onclick();    
            } else if (ev.keyCode == 13){
                if (form.doneCallback){
                    form.doneCallback();
                }
            }
        }
        
        document.body.appendChild(form.modalOverlay);
        document.body.appendChild(form.content);
        
        form.content.focus();
        return form;
    }
    
    this.button_align_left = function(){
        this.saveState();
        var sel = this.applyTag('<p align="left">', '</p>');
        this.purgeCachedSelection();
        
        return sel;
    }
    
    this.button_align_center = function(){
        this.saveState();
        var sel = this.applyTag('<p align="center">', '</p>');
        this.purgeCachedSelection();
        
        return sel;
    }
    
    this.button_align_right = function(){
        this.saveState();
        var sel = this.applyTag('<p align="right">', '</p>');
        this.purgeCachedSelection();
        
        return sel;
    }
    
    this.button_align_justified = function(){
        this.saveState();
        var sel = this.applyTag('<p align="justify">', '</p>');
        this.purgeCachedSelection();
        
        return sel;
    }
    
    this.button_bold = function(){
        this.saveState();
        var sel = this.applyTag('**');
        this.purgeCachedSelection();
        
        return sel;
    }
    
    this.button_italic = function(){
        this.saveState();
        var sel = this.applyTag('_');
        this.purgeCachedSelection();
        
        return sel;
    }
    
    this.button_deleted = function(){
        this.saveState();
        var sel = this.applyTag('<strike>', '</strike>');
        this.purgeCachedSelection();
        
        return sel;
    }
    
    this.button_ulist = function(){
        this.saveState();
        
        var currentLine = this.getCurrentLine();
        var lineSelection = this.getCurrentLineSelection();
        
        var selection = this.replaceTextAtSelection('  * ' + currentLine, lineSelection);
        selection = this.selectEnd(selection);
        
        this.purgeCachedSelection();
        return selection;
    }
    
    this.button_numlist = function(){
        this.saveState();
        
        var currentLine = this.getCurrentLine();
        var lineSelection = this.getCurrentLineSelection();
        
        var selection = this.replaceTextAtSelection('  1. ' + currentLine, lineSelection);
        selection = this.selectEnd(selection);
        
        this.purgeCachedSelection();
        return selection;
    }
    
    this.button_code = function(){
        this.saveState();
        
        if (this.getSelectedText().substr(0, tab.length) == tab){
            // The selected text block is already indented, unindent it.
            this.unindent();    
        } else {
            // The selected text block is not indented, indent it.
            this.indent();
        }
        
        this.purgeCachedSelection();
    }
    
    this.button_link = function(){
        var form = this.createForm(250, 110);
        
        form.urlLabel = document.createElement('p');
        form.urlLabel.style.left = "10px";
        form.urlLabel.style.top = "10px";
        form.urlLabel.className = "uedit_ui_form_label";
        form.urlLabel.innerHTML = 'Url:';
        
        form.textLabel = document.createElement('p');
        form.textLabel.style.left = "10px";
        form.textLabel.style.top = "30px";
        form.textLabel.className = "uedit_ui_form_label";
        form.textLabel.innerHTML = 'Text:';
        
        form.titleLabel = document.createElement('p');
        form.titleLabel.style.left = "10px";
        form.titleLabel.style.top = "50px";
        form.titleLabel.className = "uedit_ui_form_label";
        form.titleLabel.innerHTML = 'Title:';
        
        form.urlBox = document.createElement('input');
        form.urlBox.className = "uedit_ui_form_text";
        form.urlBox.type = "text";
        form.urlBox.placeholder = "Url";
        form.urlBox.style.right = "20px";
        form.urlBox.style.top = "20px"
        
        form.textBox = document.createElement('input');
        form.textBox.className = "uedit_ui_form_text";
        form.textBox.type = "text";
        form.textBox.placeholder = "Optional link text";
        form.textBox.style.right = "20px";
        form.textBox.style.top = "40px"
        
        // If some text is selected, use it as the link text
        if (this.getSelection().length() != 0){
            form.textBox.value = this.getSelectedText();
        }
        
        form.titleBox = document.createElement('input');
        form.titleBox.className = "uedit_ui_form_text";
        form.titleBox.type = "text";
        form.titleBox.placeholder = "Optional title text";
        form.titleBox.style.right = "20px";
        form.titleBox.style.top = "60px"
        
        form.okButton = document.createElement('a');
        form.okButton.className = "uedit_ui_form_button_ok";
        form.okButton.innerHTML = "Insert <img src='gfx/done-icon.png' />";
        
        form.okButton.onmouseover = function(){
			form.okButton.style.color = "#DFC21D";
		}
		
		form.okButton.onmouseout = function(){
			form.okButton.style.color = "white";
		}
        
        form.okButton.onclick = (function(){
            var url = form.urlBox.value;
            var text = form.textBox.value;
            var title = form.titleBox.value;
            
            if (url == ""){
                form.urlBox.focus();
                return;
            }
                        
            var urlTag = "[" + (text || url) + "](" + url + " \"" + title + "\")";
                       
            this.saveState();
            if (this.getSelection().length() != 0){
                this.replaceSelectedText(urlTag);
            } else {
                this.injectText(urlTag);    
            }
            
            // Simulate a click on [close]
            form.closeButton.onclick();
        }).bind(this);
        
        form.doneCallback = form.okButton.onclick;
        
        form.content.appendChild(form.urlLabel);
        form.content.appendChild(form.textLabel);
        form.content.appendChild(form.titleLabel);
        form.content.appendChild(form.urlBox);
        form.content.appendChild(form.textBox);
        form.content.appendChild(form.titleBox);
        form.content.appendChild(form.okButton);
        
        return form;
    }
    
    this.button_video = function(){
        var form = this.createForm(250, 110);
        
        form.youtubeButton = document.createElement('a');
        form.youtubeButton.className = 'uedit_ui_youtube';
        form.youtubeButton.onclick = function(){
            form.service = 'youtube';
            form.next();
        };
        
        form.blipButton = document.createElement('a');
        form.blipButton.className = 'uedit_ui_bliptv';
        form.blipButton.onclick = function(){          
            form.service = 'blip';
            form.next();
        }
        
        form.tipText = document.createElement('p');
        form.tipText.className = 'uedit_ui_video_tooltip';
        form.tipText.innerHTML = 'Choose your service provider.';
        
        form.next = (function(){           
            form.content.removeChild(form.youtubeButton);
            form.content.removeChild(form.blipButton);
            form.content.removeChild(form.tipText);
            
            form.urlLabel = document.createElement('p');
            form.urlLabel.style.left = "10px";
            form.urlLabel.style.top = "5px";
            form.urlLabel.className = "uedit_ui_form_label";
            form.urlLabel.innerHTML = 'Insert the video url:';
            
            form.urlBox = document.createElement('input');
            form.urlBox.className = "uedit_ui_form_text";            
            form.urlBox.type = "text";
            form.urlBox.style.left = "10px";
            form.urlBox.style.top = "35px"
            form.urlBox.style.width = "230px";
            
            form.instructions = document.createElement('a');
            form.instructions.className = "uedit_ui_form_link";
            form.instructions.href = "http://google.com";
            form.instructions.innerHTML = '(See instructions)';
            form.instructions.style.top = "60px";
            form.instructions.style.right = "10px";
            
            form.okButton = document.createElement('a');
            form.okButton.className = "uedit_ui_form_button_ok";
            form.okButton.innerHTML = "Insert <img src='gfx/done-icon.png' />";
            
            form.okButton.onmouseover = function(){
				form.okButton.style.color = "#DFC21D";
			}
		
			form.okButton.onmouseout = function(){
				form.okButton.style.color = "white";
			}
            
            form.okButton.onclick = (function(){             
                var regMatches = null;
                if (form.service == 'youtube'){
                    regMatches = (/\?v=([\-\w]+)/i).exec(form.urlBox.value);
                } else if (form.service == 'blip') {
                    regMatches = (/play\/([\-\w]+)/i).exec(form.urlBox.value);
                }
                
                if (regMatches){
                    this.saveState();
                    
                    this.injectText(
                        '[video ' + regMatches[1] + 
                        ' "200x300"' + ' ' + form.service + ']'
                    );
                    
                    form.closeButton.onclick();
                } else {
                    // invalid link inserted, focus on the textbox
                    form.urlBox.focus();
                    return;
                }
            }).bind(this);
            
            form.doneCallback = form.okButton.onclick;
            
            form.content.appendChild(form.urlLabel);
            form.content.appendChild(form.urlBox);
            form.content.appendChild(form.instructions);
            form.content.appendChild(form.okButton);
        }).bind(this);
        
        form.content.appendChild(form.youtubeButton);
        form.content.appendChild(form.blipButton);
        form.content.appendChild(form.tipText);
    }
    
    this.button_image = function(){
        var form = this.createForm(250, 110);
        
        form.urlLabel = document.createElement('p');
        form.urlLabel.style.left = "10px";
        form.urlLabel.style.top = "10px";
        form.urlLabel.className = "uedit_ui_form_label";
        form.urlLabel.innerHTML = 'Image url:';
        
        form.titleLabel = document.createElement('p');
        form.titleLabel.style.left = "10px";
        form.titleLabel.style.top = "30px";
        form.titleLabel.className = "uedit_ui_form_label";
        form.titleLabel.innerHTML = 'Title:';
        
        form.altLabel = document.createElement('p');
        form.altLabel.style.left = "10px";
        form.altLabel.style.top = "50px";
        form.altLabel.className = "uedit_ui_form_label";
        form.altLabel.innerHTML = 'Alt. text:';
        
        form.urlBox = document.createElement('input');
        form.urlBox.className = "uedit_ui_form_text";
        form.urlBox.type = "text";
        form.urlBox.placeholder = "Url to the image";
        form.urlBox.style.right = "20px";
        form.urlBox.style.width = "150px";
        form.urlBox.style.top = "20px"
        
        
        form.titleBox = document.createElement('input');
        form.titleBox.className = "uedit_ui_form_text";
        form.titleBox.type = "text";
        form.titleBox.placeholder = "Optional image title";
        form.titleBox.style.right = "20px";
        form.titleBox.style.width = "150px";
        form.titleBox.style.top = "40px"
        
        
        form.altBox = document.createElement('input');
        form.altBox.className = "uedit_ui_form_text";
        form.altBox.type = "text";
        form.altBox.placeholder = "Optional alt text";
        form.altBox.style.right = "20px";
        form.altBox.style.width = "150px";
        form.altBox.style.top = "60px"
                
        form.okButton = document.createElement('a');
        form.okButton.className = "uedit_ui_form_button_ok";
        form.okButton.innerHTML = "Insert <img src='gfx/done-icon.png' />";
            
        form.okButton.onmouseover = function(){
	    	form.okButton.style.color = "#DFC21D";
		}
		
		form.okButton.onmouseout = function(){
			form.okButton.style.color = "white";
		}
		
        form.okButton.onclick = (function(){
            var url = form.urlBox.value;
            var altText = form.altBox.value;
            var title = form.titleBox.value;
            
            if (url == ""){
                form.urlBox.focus();
                return;
            }
            
            var imageTag = "!";
            imageTag += "[" + (altText || url) + "](" + url + " \"" + title + "\")";
            
            // Inject the tag
            this.saveState();
            this.injectText(imageTag);   

            // Simulate a click on [close]
            form.closeButton.onclick();            
        }).bind(this);
        
        form.doneCallback = form.okButton.onclick;
        
        form.content.appendChild(form.urlLabel);
        form.content.appendChild(form.titleLabel);
        form.content.appendChild(form.altLabel);
        form.content.appendChild(form.okButton);
        form.content.appendChild(form.urlBox);
        form.content.appendChild(form.titleBox);
        form.content.appendChild(form.altBox);
        
        return form;
    }
    
    this.button_help = function(){
        window.open(HELP_URL);
    }
    
    this.button_header = function(level){
        
    }
    
    this.button_undo = function(){
        this.stateManager.undo();
        
        this.purgeCachedSelection();
    }
    
    this.button_redo = function(){
        this.stateManager.redo();
        
        this.purgeCachedSelection();
    }
}

var ueditCreate = function(textarea){
    var ueditInstance = new Object();
    Uedit.apply(ueditInstance);
    ueditInstance.init(textarea);
    
    return ueditInstance;
}
