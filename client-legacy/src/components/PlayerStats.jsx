import React from "react"
import PropertyInfo from "./PropertyInfo"
import { Modal, Button } from "react-bootstrap"

class PlayerStats extends React.Component{

  constructor(props){
    super(props)
    this.handleChange = this.handleChange.bind(this)
    this.flipModalState = this.flipModalState.bind(this)
    this.state = {
      selectedProperty: null,
      selectedPropertyIndex: null,
      showModal: false
    }
  }

  getPropertyList(){
    let ownedProperties = []
    if (this.props.player && this.props.player.properties){
      ownedProperties = this.props.player.properties.map((property,index) => {
       return <option key={index+1} value={index+1}>{property.name}</option>
      })
    }
    ownedProperties.unshift(<option key={0} value={0}>Select a property</option>)
    return ownedProperties
  }

  handleChange(){
    let indexToSet = document.querySelector("#property-selector").value - 1
    this.setSelectedIndex(indexToSet)
  }

  setSelectedIndex(index){
    this.setState({selectedPropertyIndex: index},this.setSelectedProperty)
  }

  setSelectedProperty(){

    if (this.props.player && this.props.player.properties){

     this.setState({selectedProperty: this.props.player.properties[this.state.selectedPropertyIndex]})

   }
 }

 flipModalState(){
  this.setState({showModal: !this.state.showModal,
                 selectedProperty: null})
 }




  render(){

    let name 

    let funds

    let propertyList = this.getPropertyList()


  if (this.props.player){
    name = this.props.player.name

    funds = this.props.player.money
}
    return(
      <div>
        <div style={{paddingRight: 50}}>
          <h5 style={{marginTop: "5px", marginBottom: "5px"}}>Current Player: {name}</h5>
          <h5 style={{marginTop: "5px", marginBottom: "5px"}}>Money: {funds}</h5>
        </div>
        <div>
          <Button onClick={this.flipModalState}>Manage Properties</Button>
          <Modal
            show={this.state.showModal}
            onHide={this.flipModalState}
            container={this}>
            <Modal.Header>
              <Modal.Title>Property Management</Modal.Title>
            </Modal.Header>

            <Modal.Body>
              <p><b>Properties:</b></p>
              <select id="property-selector" onChange={this.handleChange}>
                {propertyList}
              </select>

              <hr />

              <PropertyInfo 
                property={this.state.selectedProperty}
                player={this.props.player}/>

            </Modal.Body>

            <Modal.Footer>
              <Button onClick={this.flipModalState}>Close</Button>
            </Modal.Footer>
          </Modal>
          
        </div>
      </div>
    )
  }

}

export default PlayerStats