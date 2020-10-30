/**
 * HDFS Web Client for Distributed Storage Lab at Aarhus University
 */
window.app = new Vue({
    el: '#app',
    data(){
        return {
            server_address_set: false,
            server_address: "http://localhost:9000",
            error: null,

            filelist: null,
            file_id_download: null,
            upload_file: null,
        }
    },

    mounted(){
        const stored_ns_address = localStorage.getItem('namenode_address')
        if(stored_ns_address){
            this.server_address = stored_ns_address
            this.server_address_set = true
            this.list_files()
        }
    },
    methods: {
        set_server_address(){
            if(!this.server_address.length){
                return
            }

            try{
                fetch(this.server_address).then(res => {
                    if(res.ok){
                        return res.json()
                    }
                    throw "no namenode"
                }).then(res => {
                    if(res && res.message && res.message.toLowerCase().indexOf('namenode') >= 0){
                        this.server_address_set = true
                        localStorage['namenode_address'] = this.server_address
                        this.list_files()
                    }
                    else{
                        throw "no namenode"
                    }
                }).catch(e => {
                    this.error = "No namenode found at " + this.server_address
                })
            } catch(e){
                console.error("Error trying server: ", e)
                this.error = "No namenode found at " + this.server_address
            }
        },

        list_files(){
            this.filelist = []
            fetch(this.server_address + "/files").then(res => {
                if(!res.ok){
                    console.error("Error listing files: ", res)
                    this.error = "Error listing files: " + "HTTP "+ res.status + ": " + res.statusText
                    return
                }
                return res.json()
            }).then(response => {
                this.filelist = response.files
            })
        },

        file_selected(event){
            if(!event.target || !event.target.files || event.target.files.length !== 1){
                return
            }
            
            this.upload_file = event.target.files[0]
        },

        upload(){
            if(!this.upload_file){return}

            const namenode_payload = {
                filename: this.upload_file.name,
                size: this.upload_file.size,
                type: this.upload_file.type
            }
            
            fetch(this.server_address + "/files", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(namenode_payload)
            }).then(res => {
                if(!res.ok){
                    throw "Error creating file in Namenode: HTTP " + res.status
                }
                // Parse response JSON
                return res.json()
            }).then(result => {
                // Ok, we got the new file ID and replica locations array
                const file_id = result.id
                const replica_locations = result.replica_locations
                // Use Javascript FormData to construct a multipart request payload that has
                // both binary data and ordinary fields
                /*
                let datanode_payload = new FormData()
                datanode_payload.append('file', this.upload_file)
                datanode_payload.append('file_id', file_id)
                datanode_payload.append('replica_locations', replica_locations.join(' '))
                */
                // Read the file contents
                let reader = new FileReader()
                var self = this
                reader.onloadend = () => {
                    let file_b64 = reader.result
                    // Cut off the beginning "data:application/pdf;base64,"
                    const idx = file_b64.indexOf(';base64,')
                    file_b64 = file_b64.slice(idx+';base64,'.length)
                    self.upload_to_datanode(file_b64, file_id, replica_locations)
                }
                reader.readAsDataURL(this.upload_file)
                
            }).catch(err => {
                this.error = err
            })

        },

        upload_to_datanode(file_contents_b64, file_id, replica_locations){
            
            // Select a random replica location that we'll send the request to,
            // and remove it from the locations array
            const random_array_index = Math.floor(Math.random() * replica_locations.length)
            // Use the Javascript array.splice() method that removes an element by index and returns it
            const target_dn = replica_locations.splice(random_array_index, 1)
            
            let payload = {
                "file_id": file_id,
                "replica_locations": replica_locations,
                "file_data": file_contents_b64
            }

            // Send the file to the selected Datanode
            fetch(target_dn + '/write', {
                method: 'POST',
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload)
            }).then(res => { 
                if(!res.ok){
                    throw "Error storing file at Datanode: HTTP " + res.status
                }
                // OK, the file was successfully uploaded. Refresh the file list
                this.list_files()
                this.upload_file = null
                document.getElementById("file-input").value = null
            })
        },

        download_file(){
            const file = this.filelist.find(f => f.id == this.file_id_download)
            if(!file){
                this.error = "File "+this.file_id_download+" does not exist"
                return
            }

            // Select a random datanode to download from
            const arr = file.replica_locations.split(' ')
            const random_array_index = Math.floor(Math.random() * arr.length)
            const target_dn = arr.splice(random_array_index, 1)

            fetch(target_dn+'/read/'+file.id).then(res => {
                if(!res.ok){
                    this.error = "Failed to download " + file.name
                    return
                }
                return res.arrayBuffer()
            }).then(file_data => {
                let blob = new Blob([file_data], {type: file.type})
                let url = window.URL.createObjectURL(blob)
                var a = document.createElement('a')
                document.body.appendChild(a)
                a.href = url;
                a.target = '_blank'
                a.click();
                window.URL.revokeObjectURL(url);

                this.file_id_download = null
            }).catch(err => {
                this.error = "Error downloading "+file.filename
            })
        }
    }
})