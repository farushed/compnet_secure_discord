export function getImageData(file) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();

        reader.onload = function(event) {
            let img = new Image();
            img.src = event.target.result;

            img.onload = function() {
                let canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                let ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                resolve(imageData);
            };
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function imageDataToDataURL(imageData) {
    let canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    let ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL();
}

export function imageDataToFile(imageData) {
    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    ctx.putImageData(imageData, 0, 0);

    // Convert the canvas to a file
    return new Promise(resolve => {
        canvas.toBlob(blob => {
            resolve(new File([blob], 'image.png', { type: 'image/png' }));
        }, 'image/png');
    });
}