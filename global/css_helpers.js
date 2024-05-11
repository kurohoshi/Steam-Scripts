function addSvgBlock(elem) {
    const svgString = '<div class="userscript-svg-assets">'
    +    '<svg class="solid-clr-filters">'
    +       '<filter id="filter-red" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
    +          '<feColorMatrix type="matrix" values="0 0 0 0   0.8   0 0 0 0   0   0 0 0 0   0   0 0 0 1   0" />'
    +       '</filter>'
    +       '<filter id="filter-red-bright" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
    +          '<feColorMatrix type="matrix" values="0 0 0 0   1   0 0 0 0   0   0 0 0 0   0   0 0 0 1   0" />'
    +       '</filter>'
    +       '<filter id="filter-green" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
    +          '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   0.8   0 0 0 0   0   0 0 0 1   0" />'
    +       '</filter>'
    +       '<filter id="filter-green-bright" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
    +          '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   1   0 0 0 0   0   0 0 0 1   0" />'
    +       '</filter>'
    +       '<filter id="filter-blue" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
    +          '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   0   0 0 0 0   0.8   0 0 0 1   0" />'
    +       '</filter>'
    +       '<filter id="filter-blue-bright" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
    +          '<feColorMatrix type="matrix" values="0 0 0 0   0   0 0 0 0   0   0 0 0 0   1   0 0 0 1   0" />'
    +       '</filter>'
    +       '<filter id="filter-dark-gray" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
    +          '<feColorMatrix type="matrix" values="0 0 0 0   0.33   0 0 0 0   0.33   0 0 0 0   0.33   0 0 0 1   0" />'
    +       '</filter>'
    +       '<filter id="filter-steam-gray" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
    +          '<feColorMatrix type="matrix" values="0 0 0 0   0.77   0 0 0 0   0.76   0 0 0 0   0.75   0 0 0 1   0" />'
    +       '</filter>'
    +          '<filter id="filter-steam-sky-blue" color-interpolation-filters="sRGB" x="0" y="0" height="100%" width="100%">'
    +          '<feColorMatrix type="matrix" values="0 0 0 0   0.328   0 0 0 0   0.6445   0 0 0 0   0.828   0 0 0 1   0" />'
    +       '</filter>'
    +    '</svg>'
    +    '<svg class="svg-download" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 29" fill="none">'
    +       '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M26 20 V25 H4 V20 H0 V29 H30 V20 H26 Z"></path>'
    +       '<path fill="currentColor"'
    +          'd="M17 12.1716 L21.5858 7.58578 L24.4142 10.4142 L15 19.8284 L5.58582 10.4142 L8.41424 7.58578 L13 12.1715 V0 H17 V12.1716 Z">'
    +       '</path>'
    +    '</svg>'
    +    '<svg class="svg-upload" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 29" fill="none">'
    +       '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M26 20 V25 H4 V20 H0 V29 H30 V20 H26 Z"></path>'
    +       '<path fill="currentColor"'
    +          'd="M17 7.6568 L21.5858 12.24262 L24.4142 9.4142 L15 0 L5.58582 9.4142 L8.41424 12.24262 L13 7.6568 V19.8284 H17 V7.6568 Z">'
    +       '</path>'
    +    '</svg>'
    +    '<svg class="svg-x" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" fill="none">'
    +       '<path fill="currentColor"'
    +          'd="M29.12 4.41 L25.59 0.880005 L15 11.46 L4.41 0.880005 L0.880005 4.41 L11.46 15 L0.880005 25.59 L4.41 29.12 L15 18.54 L25.59 29.12 L29.12 25.59 L18.54 15 L29.12 4.41 Z">'
    +       '</path>'
    +    '</svg>'
    +    '<svg class="svg-reload" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">'
    +       '<path fill="none" stroke="currentColor" stroke-width="30" stroke-linecap="round" stroke-miterlimit="10"'
    +          'd="M229.809 147.639 A103.5 103.5 0 1 1 211 66.75">'
    +       '</path>'
    +       '<polygon  fill="currentColor" points="147.639,108.361 245.755,10.166 245.834,108.361"></polygon>'
    +    '</svg>'
    +    '<svg class="svg-reload-2" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">'
    +       '<path fill="none" stroke="currentColor" stroke-width="30" stroke-linecap="round" stroke-miterlimit="10"'
    +          'd="M229.809,147.639 c-9.178,47.863-51.27,84.027-101.809,84.027 c-57.253,0-103.667-46.412-103.667-103.666 S70.747,24.334,128,24.334 c34.107,0,64.368,16.472,83.261,41.895">'
    +       '</path>'
    +       '<polygon  fill="currentColor" points="147.639,108.361 245.755,10.166 245.834,108.361"></polygon>'
    +    '</svg>'
    + '</div>';
 
    elem.insertAdjacentHTML('afterend', svgString);
 }

function cssAddOverlay() {
    let innerHTMLString = '';
    let overlayState;
    if(arguments.length>0 && typeof arguments[arguments.length-1] === 'object') {
       overlayState = arguments[arguments.length-1].initialState ?? '';
    } else {
       overlayState = '';
    }
 
    if(arguments.length>1 || arguments.length===1 && typeof arguments[0]!=='object') {
       for(let i=0; i<arguments.length; i++) {
          if(typeof arguments[i] === 'string') {
             innerHTMLString += arguments[i];
          }
       }
    }
 
    return `<div class="userscript-overlay ${overlayState}">`
    +    innerHTMLString
    + '</div>';
 }
 function cssAddThrobber() {
    return '<div class="userscript-throbber">'
    +    '<div class="throbber-bar"></div>'
    +    '<div class="throbber-bar"></div>'
    +    '<div class="throbber-bar"></div>'
    + '</div>';
 }
 